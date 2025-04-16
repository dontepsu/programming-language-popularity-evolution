import { fromEventPattern, merge, map, startWith, distinctUntilChanged } from "rxjs";

import { registerFilters } from './filters'
import { renderBubbleChart } from './bubblechart'

import './style.css'

// Register the filters i.e attach listeners etc
registerFilters()

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

    cleanup = await renderBubbleChart(params)
});
