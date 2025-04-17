import * as d3 from "d3";

import { updateBubbleOverlay } from './bubbleset'
import { clamp, MIN_VALUE } from './util'

const YEAR_LABEL_OPACITY = 0.7;
const margin = { top: 20, right: 30, bottom: 30, left: 40 };
const DEFAULT_CHANGE_INTERVAL = 2000;
const MAX_D = 0.1

/**
 * Global set to track languages that have been toggled on.
 * @type {Set<string>}
 */
export const trackedLanguages = new Set();

/**
 * Returns logarithmic x and y scales based on the given dimensions and maximum values.
 *
 * @param {number} width - The width of the SVG container.
 * @param {number} height - The height of the SVG container.
 * @param {number} maxX - The maximum x value (used to determine x scale domain).
 * @param {number} maxY - The maximum y value (used to determine y scale domain).
 * @returns {[Function, Function]} Array containing the x and y scale functions.
 */
const getAxis = (width, height, maxX, maxY) => {
    const x = d3.scaleLog()
        .domain([MIN_VALUE, maxX])
        .range([margin.left, width - margin.right]);

    const y = d3.scaleLog()
        .domain([MIN_VALUE, maxY])
        .range([height - margin.bottom, margin.top]);

    return [x, y];
};

/**
 * Creates a color scale mapping unique group keys to color values.
 *
 * @param {Array<string>} colorKeys - Array of group keys.
 * @returns {Function} D3 ordinal scale mapping group keys to colors.
 */
const createColorScale = (colorKeys) => {
    const uniqueKeys = Array.from(new Set(colorKeys));
    const colorScale = d3.scaleOrdinal()
        .domain(uniqueKeys)
        .range(d3.schemeCategory10.concat(d3.schemeSet3).slice(0, uniqueKeys.length));
    return colorScale;
};

/**
 * Sets up the x and y axes on the provided SVG element.
 * The function computes 10 tick values for both axes using a logarithmic scale.
 *
 * @param {Object} svg - D3 selection for the SVG element.
 * @param {number} height - Height of the SVG container.
 * @param {number} maxX - Maximum value for the x axis.
 * @param {number} maxY - Maximum value for the y axis.
 * @returns {Function} A function that accepts the x and y scale functions to render the axes.
 */
const setUpAxis = (svg, width, height, maxX, maxY) => (x, y) => {
    const xTicks = d3.range(0, 10).map(i =>
        Math.exp(Math.log(MIN_VALUE) + (i / 9) * (Math.log(maxX) - Math.log(MIN_VALUE)))
    );
    const yTicks = d3.range(0, 10).map(i =>
        Math.exp(Math.log(MIN_VALUE) + (i / 9) * (Math.log(maxY) - Math.log(MIN_VALUE)))
    );

    svg.append("g")
        .attr("transform", `translate(0,${height - margin.bottom})`)
        .call(d3.axisBottom(x)
            .tickValues(xTicks)
            .tickFormat(d3.format(".01%")));

    svg.append("g")
        .attr("transform", `translate(${margin.left},0)`)
        .call(d3.axisLeft(y)
            .tickValues(yTicks)
            .tickFormat(d3.format(".01%")));

    svg.append("text")
        .attr("class", "x-axis-label")
        .attr("x", width / 2)
        .attr("y", height - margin.bottom - 20)
        .style("text-anchor", "middle")
        .text("% of languages used the past year");

    svg.append("text")
        .attr("class", "y-axis-label")
        .attr("x", -height / 2)
        .attr("y", 70)
        .attr("transform", "rotate(-90)")
        .attr("text-anchor", "middle")
        .text("% of languages excited to use the next year");
};



/**
 * Creates a large, semi-transparent text label on the SVG for displaying the current year.
 *
 * @param {Object} svg - D3 selection for the SVG element.
 * @param {number|string} currentYear - The current year to display.
 * @param {number} width - The width of the SVG container.
 * @param {number} height - The height of the SVG container.
 * @returns {Object} The created D3 selection for the year label text element.
 */
const createYearLabel = (svg, currentYear, width, height) =>
    svg.append("text")
        .attr("class", "year-label")
        .attr("x", width / 2)
        .attr("y", height / 2 + 50)
        .attr("text-anchor", "middle")
        .attr("font-size", 180)
        .attr("font-weight", "bold")
        .attr("fill", "#f0f0f0")
        .attr("opacity", YEAR_LABEL_OPACITY)
        .text(currentYear);


/**
 * Renders the bubble chart visualization using the aggregated data.
 * This function flattens data for each year, sets up the SVG container, scales, axes,
 * and defines a timer-based animation to cycle through the years.
 *
 * @param {Object} aggregateData - The aggregated data object with max_used, max_interested, and years.
 * @returns {Function} A cleanup function that stops the animation and clears the SVG.
 */
const render = (aggregateData) => {
    let cleanUpBubbleSet = null

    const { max_used, max_interested, years } = aggregateData;

    // Flatten the yearly aggregated data into one array, adding the year into each record.
    const flatData = [];
    for (const [year, entries] of Object.entries(years)) {
        entries.forEach(d => {
            d.year = +year;
            d.colorKey = `${d.execution_model}-${d.memory_management}`;
            flatData.push(d);
        });
    }

    // Build a color scale using the computed color keys.
    const colorKeys = flatData.map(d => d.colorKey);
    const colorScale = createColorScale(colorKeys);

    const yearKeys = Object.keys(years).map(Number).sort((a, b) => a - b);
    let currentYear = d3.min(yearKeys);

    // Set up the SVG container.
    const svg = d3.select("#viz");
    const width = +svg.attr("width");
    const height = +svg.attr("height");

    // Create x and y axes
    const maxX = max_used + MAX_D
    const maxY = max_interested + MAX_D
    const [x, y] = getAxis(width, height, maxX, maxY);
    const updateAxis = setUpAxis(svg, width, height, maxX, maxY);
    updateAxis(x, y);

    // Define a radius scale for the circles based on avg_salary.
    const r = d3.scaleSqrt()
        .domain([0, d3.max(flatData, d => d.avg_salary || 0)])
        .range([5, 40]);

    const tooltip = d3.select(".tooltip");

    // Add a year label to the SVG. That big one in the background. 
    const yearLabel = createYearLabel(svg, currentYear, width, height);

    // The update function renders the dots and more
    function update(year) {
        const yearData = flatData.filter(d => d.year === year);

        const circles = svg.selectAll("circle").data(yearData, d => d.language);
        circles.join(
            enter => enter.append("circle")
                .attr("cx", d => x(clamp(d.used)))
                .attr("cy", d => y(clamp(d.interested)))
                .attr("r", d => r(d.avg_salary || 0))
                .attr("fill", d => colorScale(d.colorKey))
                .attr("opacity", 0.7)
                .on("mouseover", (event, d) => {
                    tooltip.style("display", "block")
                        .style("left", (event.pageX + 5) + "px")
                        .style("top", (event.pageY - 28) + "px")
                        .html(`
                          <strong>${d.language}</strong>
                          <br>
                          Used: ${(d.used * 100).toFixed(2)}%
                          <br>
                          Interested: ${(d.interested * 100).toFixed(2)}%
                          <br>
                          Salary: ${d.avg_salary ? `$${Math.round(d.avg_salary)}` : "N/A"}
                        `);
                })
                .on("mouseout", () => tooltip.style("display", "none"))
                .on("click", (event, d) => {
                    if (trackedLanguages.has(d.language)) {
                        trackedLanguages.delete(d.language);
                    } else {
                        trackedLanguages.add(d.language);
                        // track tracked langauges
                        if (import.meta.env.PROD) {
                            gtag('event', 'track_language', {
                                filter_type: 'ball_circle',
                                filter_value: d.language
                            });
                        }
                    }
                    svg.selectAll("circle")
                        .attr("stroke", d => trackedLanguages.has(d.language) ? "red" : "none")
                        .attr("stroke-width", d => trackedLanguages.has(d.language) ? 4 : 0);
                }),
            update => update
                .transition().duration(1000)
                .attr("cx", d => x(clamp(d.used)))
                .attr("cy", d => y(clamp(d.interested)))
                .attr("r", d => r(d.avg_salary || 0)),
            exit => exit.remove()
        );

        // Update the language labels.
        // Ensure that all circles are updated with the current tracked languages!!
        svg.selectAll("circle")
            .attr("stroke", d => trackedLanguages.has(d.language) ? "red" : "none")
            .attr("stroke-width", d => trackedLanguages.has(d.language) ? 4 : 0);

        const labels = svg.selectAll(".lang-label").data(yearData, d => d.language);
        labels.join(
            enter => enter.append("text")
                .attr("class", "lang-label")
                .attr("x", d => x(clamp(d.used)))
                .attr("y", d => y(clamp(d.interested)))
                .attr("font-size", "12px")
                .attr("dy", "-1.7em")
                .attr("text-anchor", "middle")
                .attr("fill", "#323232")
                .text(d => d.language),
            update => update
                .transition().duration(1000)
                .attr("x", d => x(clamp(d.used)))
                .attr("y", d => y(clamp(d.interested)))
                .text(d => d.language),
            exit => exit.remove()
        );

        yearLabel.text(year);

        // This is the f2-bubbleset to draw contour on groups
        const renderBubbleset = Boolean(new URLSearchParams(window.location.search).get('bubbleSetActive'))
        if (renderBubbleset) {
            cleanUpBubbleSet = updateBubbleOverlay(
                yearData,
                x,
                y,
                width,
                height,
                svg,
                d => d.colorKey,
                key => colorScale(key)
            );
        } else if (cleanUpBubbleSet) {
            cleanUpBubbleSet()
            cleanUpBubbleSet = null
        }
    }

    // Timer for the "slide show".
    // TODO: make some nice slider? and configure the speed configurable.
    let i = 0;
    const yearsArray = yearKeys;
    let timer = d3.interval(() => {
        update(yearsArray[i % yearsArray.length]);
        i++;
    }, DEFAULT_CHANGE_INTERVAL);

    window.timer = timer
    return () => {
        // clean up
        d3.select("#viz").selectAll("*").remove()
        timer.stop()
        timer = null
    }
}

/**
 * Asynchronously loads aggregated data based on filter parameters and renders the bubble chart.
 *
 * @param {Object} [options={}] - Filter options for the chart.
 * @param {string|null} [options.country=null] - Country filter value.
 * @param {string|null} [options.age=null] - Age filter value.
 * @param {boolean} [options.bubbleSetActive=false] - Flag to enable bubble set overlay.
 * @returns {Promise<Function>} A promise that resolves to a cleanup function.
 */
export const renderBubbleChart = async ({
    country = null,
    age = null,
    bubbleSetActive = false
} = {}) => {
    let filter_str = ''
    filter_str += country ? `_${country}` : ''
    filter_str += age ? `_${age}` : ''

    try {
        const aggregateData = await d3.json(`${import.meta.env.BASE_URL}/data/aggregate${filter_str}.json`)
        return render(aggregateData, { bubbleSetActive })
    } catch (error) {
        console.error(error)
        // TODO: fix this
        alert('No such filter combination')
        const params = new URLSearchParams(window.location.search);
        window.history.pushState({}, '', `${window.location.pathname}?${params.toString()}`);
        return () => { }
    }
}
