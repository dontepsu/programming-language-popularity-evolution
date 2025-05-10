import { fromEventPattern, merge, map, startWith, distinctUntilChanged, Subject, filter } from "rxjs";

import { registerFilters } from './filters'
import { renderBubbleChart, BubbleChartEvents, BubbleChartAnimationEvents } from './bubblechart'

import './style.css'


const bubbleChartEvent$ = new Subject()
const bubbleControl$ = new Subject()

const registerAnimationControls = () => {
    const playBtn = document.getElementById('play-toggle');
    const yearSlider = document.getElementById('year-slider');

    let playing = false;
    let years = [];

    function togglePlay(state) {
        playing = state;
        playBtn.textContent = playing ? "⏸" : "▶";
        bubbleControl$.next({ type: playing ? BubbleChartAnimationEvents.play : BubbleChartAnimationEvents.pause });
    }


    bubbleChartEvent$.subscribe(e => {
        if (e.event === BubbleChartEvents.year_changed) {
            const idx = years.findIndex(y => +y === +e.data.year);
            if (idx !== -1 && +yearSlider.value !== idx) {
                yearSlider.value = idx;
            }
        }

        if (e.event === BubbleChartEvents.data_loaded) {
            years = e.data.years;
            yearSlider.min = 0;
            yearSlider.max = years.length - 1;
            yearSlider.value = 0;
        }
    });

    // User interaction: map index back to year and emit
    yearSlider.addEventListener("input", e => {
        const index = +e.target.value;
        const year = years[index];
        if (year !== undefined) {
            bubbleControl$.next({ type: "year", value: +year });
            if (playing) {
                togglePlay(false);
            }
        }
    });

    // Play/Pause button
    playBtn.addEventListener("click", () => {
        togglePlay(!playing);
    });
};

// Helper to turn colorKey into readable text
function legendLabelForKey(key) {
    const [exec, mem] = key.split("-");
    const execLabel = exec === "compiled" ? "Compiled" : "Interpreted";
    const memLabel = mem === "gc" ? "GC" : mem === "manual" ? "Manual" : "Other";
    return `${execLabel}, ${memLabel} memory`;
}


function renderColorLegend(colorScale) {
    const container = document.querySelector("#color-legend .legend-grid");
    container.innerHTML = ""; // Clear previous entries

    colorScale.domain().forEach(key => {
        const item = document.createElement("div");
        item.className = "legend-item";

        const box = document.createElement("div");
        box.className = "legend-color";
        box.style.backgroundColor = colorScale(key);

        const label = document.createElement("span");
        label.textContent = legendLabelForKey(key); // A readable label

        item.appendChild(box);
        item.appendChild(label);
        container.appendChild(item);
    });
}


// Register the filters i.e attach listeners etc
registerFilters()
registerAnimationControls()

bubbleChartEvent$.pipe(
    filter(({ event }) => event === BubbleChartEvents.color_scale_created)
).subscribe(e => {
    renderColorLegend(e.data)
})

// We use the query string to store parameters. It's a nice global state 🙄
const originalPushState = history.pushState;
history.pushState = function (...args) {
    originalPushState.apply(this, args);
    window.dispatchEvent(new Event("pushstate"));
};

// this RxJS stream is resposible for listerning to query string changes
// country and age will be propagated to reload
const reloadData$ = merge(
    fromEventPattern(handler => window.addEventListener("pushstate", handler)),
    fromEventPattern(handler => window.addEventListener("popstate", handler))
).pipe(
    startWith(null),
    map(() => {
        const params = new URLSearchParams(window.location.search);
        return {
            country: params.get("country") || null,
            age: params.get("age") || null,
        };
    }),
    distinctUntilChanged((prev, curr) =>
        prev.country === curr.country && prev.age === curr.age
    ),
);

let cleanup = null;

reloadData$.subscribe(async (params) => {
    if (cleanup) {
        cleanup()
        cleanup = null
    }

    cleanup = await renderBubbleChart({
        ...params,
        event$: bubbleChartEvent$,
        control$: bubbleControl$.asObservable(),
    })
});
