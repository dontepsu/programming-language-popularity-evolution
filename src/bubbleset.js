import * as d3 from "d3";
import { clamp } from './util'

/**
 * Updates the bubble set overlay on the given SVG element.
 * For each group of data points (determined by the grouping function),
 * this function computes an energy grid (using x/y scales and a simple
 * linear falloff within a given radius), adds additional energy along the
 * spanning tree edges (to force connectivity), extracts a contour with d3.contours,
 * and overlays it on the SVG.
 * 
 * Based on F2-Bubbles: Faithful Bubble Set Construction and Flexible Editing
 * Link: https://ieeexplore.ieee.org/document/9552179/
 *
 * @param {Array} data - Array of data points for the current frame (e.g., filtered by year)
 * @param {Function} x - d3 scale function for the horizontal axis (maps "used" values)
 * @param {Function} y - d3 scale function for the vertical axis (maps "interested" values)
 * @param {number} width - Width of the SVG
 * @param {number} height - Height of the SVG
 * @param {Object} svg - d3 selection for the SVG element
 * @param {Function} groupKey - Function returning a group key from a datum.
 *                              E.g., d => `${d.execution_model}-${d.memory_management}`
 * @param {Function} colorFunc - (Optional) Function that takes a group key and returns a color string.
 *                              If not provided, a default color scale is used.
 * @param {number} overlayOpacity - (Optional) The fill opacity for the contour overlays (default is 0.3).
 */
function updateBubbleOverlay(data, x, y, width, height, svg, groupKey, colorFunc, overlayOpacity = 0.3) {
    // If no grouping function is provided, put all data in one group.
    if (!groupKey) groupKey = () => "default";
    // for cleanup
    const renderedKeys = [];

    // Group data using d3.group.
    const groups = d3.group(data, groupKey);

    // Remove any existing overlay paths.
    svg.selectAll(".bubble-overlay").remove();

    // TODO: These could be made customizable inthe feature
    const GRID_RESOLUTION = 5;       // grid resolution in pixels; lower values give higher resolution
    const POINT_ENERGY_RADIUS = 50;  // radius (in pixels) for energy contribution from each point
    const EDGE_ENERGY_RADIUS = POINT_ENERGY_RADIUS / 2; // smaller radius for edge contributions
    const CONTOUR_THRESHOLD = 0.5;  // threshold for contour extraction

    // Create a default color scale in case no colorFunc is provided.
    const defaultColorScale = d3.scaleOrdinal(d3.schemeCategory10);

    // Process each group.
    groups.forEach((groupData, key) => {
        // Sanitize the key to ensure it is safe for CSS selectors.
        const safeKey = key.replace(/[^\w-]/g, '_');
        renderedKeys.push(safeKey);

        // Determine the color for this group.
        const groupColor = (typeof colorFunc === "function") ? colorFunc(key) : defaultColorScale(safeKey);

        // Create a 2D grid for the SVG.
        const cols = Math.ceil(width / GRID_RESOLUTION);
        const rows = Math.ceil(height / GRID_RESOLUTION);
        let grid = new Array(rows);
        for (let i = 0; i < rows; i++) {
            grid[i] = new Array(cols).fill(0);
        }

        // Compute SVG coordinates for each data point.
        const points = groupData.map(d => ({
            x: x(clamp(d.used)),
            y: y(clamp(d.interested))
        }));

        // Add energy contributions from each point.
        points.forEach(pt => {
            for (let i = 0; i < rows; i++) {
                for (let j = 0; j < cols; j++) {
                    const cellCenterX = j * GRID_RESOLUTION + GRID_RESOLUTION / 2;
                    const cellCenterY = i * GRID_RESOLUTION + GRID_RESOLUTION / 2;
                    const dist = Math.hypot(cellCenterX - pt.x, cellCenterY - pt.y);
                    if (dist < POINT_ENERGY_RADIUS) {
                        grid[i][j] += (POINT_ENERGY_RADIUS - dist) / POINT_ENERGY_RADIUS;
                    }
                }
            }
        });

        // Compute a spanning tree to force connectivity among points.
        if (points.length > 1) {
            const mstEdges = computeMST(points);
            mstEdges.forEach(edge => {
                const dx = edge.q.x - edge.p.x;
                const dy = edge.q.y - edge.p.y;
                const length = Math.hypot(dx, dy);
                const samples = Math.ceil(length / GRID_RESOLUTION);
                for (let i = 0; i <= samples; i++) {
                    const t = i / samples;
                    const sx = edge.p.x + t * dx;
                    const sy = edge.p.y + t * dy;
                    for (let i2 = 0; i2 < rows; i2++) {
                        for (let j2 = 0; j2 < cols; j2++) {
                            const cellCenterX = j2 * GRID_RESOLUTION + GRID_RESOLUTION / 2;
                            const cellCenterY = i2 * GRID_RESOLUTION + GRID_RESOLUTION / 2;
                            const dist = Math.hypot(cellCenterX - sx, cellCenterY - sy);
                            if (dist < EDGE_ENERGY_RADIUS) {
                                grid[i2][j2] += (EDGE_ENERGY_RADIUS - dist) / EDGE_ENERGY_RADIUS;
                            }
                        }
                    }
                }
            });
        }

        // Flatten the grid (row-major order) for d3.contours.
        const values = grid.flat();

        // Create a contour generator.
        const contourGenerator = d3.contours()
            .size([cols, rows])
            .thresholds([CONTOUR_THRESHOLD]);

        const contours = contourGenerator(values);

        // Create a path generator mapping grid coordinates (scaled by GRID_RESOLUTION) to SVG coordinates.
        const pathGenerator = d3.geoPath(d3.geoIdentity().scale(GRID_RESOLUTION));

        // Append the contour for this group.
        svg.selectAll(`.bubble-overlay-${safeKey}`)
            .data(contours)
            .enter()
            .append("path")
            .attr("class", `bubble-overlay bubble-overlay-${safeKey}`)
            .attr("d", pathGenerator)
            // Set fill to the groupColor with the provided opacity; 
            // set stroke to the same color for visibility.
            .attr("fill", groupColor)
            .attr("fill-opacity", overlayOpacity)
            .attr("stroke", groupColor)
            .attr("stroke-width", 2);
    });

    return () => {
        for (const key of renderedKeys) {
            svg.selectAll(`.bubble-overlay-${key}`).remove();
        }
    };
}

/**
 * Computes a simple Minimum Spanning Tree (MST) for an array of points
 * using Prim’s algorithm. Each point in the array should be an object with
 * numeric properties x and y.
 *
 * Link: https://www.w3schools.com/dsa/dsa_algo_mst_prim.php
 * 
 * @param {Array} points - Array of points with {x, y}
 * @returns {Array} edges - Array of edges, each having properties {p, q} where p and q are points.
 */
function computeMST(points) {
    const n = points.length;
    if (n <= 1) return [];

    const visited = [points[0]];
    const notVisited = points.slice(1);
    const edges = [];

    while (notVisited.length > 0) {
        let bestDist = Infinity;
        let bestEdge = null;
        let bestIndex = -1;
        for (let i = 0; i < visited.length; i++) {
            for (let j = 0; j < notVisited.length; j++) {
                const dx = visited[i].x - notVisited[j].x;
                const dy = visited[i].y - notVisited[j].y;
                const d = dx * dx + dy * dy;
                if (d < bestDist) {
                    bestDist = d;
                    bestEdge = { p: visited[i], q: notVisited[j] };
                    bestIndex = j;
                }
            }
        }
        edges.push(bestEdge);
        visited.push(notVisited[bestIndex]);
        notVisited.splice(bestIndex, 1);
    }
    return edges;
}


export { updateBubbleOverlay }
