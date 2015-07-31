var config = {
	standardWidth: "100%",
	standardHeight: 500,
	sidebarWidth: 250,
	sidebarSpacing: 40,
	labelOffset: 5,
	editWidth: 400,
	editHeight: 400,
	breakEdgeDist: 0.2,
	slidingFactor: 0.2,
	clickThreshold: 300,
	pixelTolerance : 1,
	anglesTolerance: 0.01,
	polygonTolerance: 0.05,
	matrixDetTolerance: 0.01,
	extensionLength: 30,
	sidelength: 50,
	debug: true
};

var fullOptions = {
	orientation: "horizontal",
	visibleVertices: true,
	vertexRotate: false,
	vertexEdit: false,
	visibleEdges: true,
	clickableEdges: false,
	patternsTraceable: false,
	displayInterior: true,
	groupDraggable: false,
	interiorClickable: true,
	paletteTransform: num.id,
	autoresize: true
};


var buildSvg = function(selector, width, height) {

	return d3.select(selector).append("svg")
	.attr("width", width)
	.attr("height", height);
};

var buildBg = function(svg, enableZooming, clickToClear, zoomHandler) {

	var bg = svg.append("rect")
	.classed("svg-background", true)
	.attr("width", "100%")
	.attr("height", "100%")
	.attr("x", 0)
	.attr("y", 0)
	.attr("fill", "white");

	if (enableZooming) {
		bg.style("cursor", "move").call(zoomHandler);
	}

	if (clickToClear) {
		bg.on("click", function() { selection.clear(); });
	}

	return bg;
};

var buildDisplay = function(container, transform, isCanvas) {
	return container.append("g")
	.datum({
		this: this,
		origTransform: _.cloneDeep(transform),
		transform: transform
	})
	.classed(isCanvas ? "display canvas" : "display", true)
	.attr("transform", num.getTransform);
};

var buildPalette = function(selector, options) {

	var svg = buildSvg(selector, config.standardWidth, config.sidebarWidth);
	var bg = buildBg(svg, false, true);
	var display = buildDisplay(svg, num.translate(0, 0.9 * config.sidebarWidth));

	return svgDrawer(display, options);
};

var buildPane = function(selector, options) {

	var svg = buildSvg(selector, config.editWidth, config.editHeight);
	var bg = buildBg(svg, true, false, d3.behavior.zoom().on("zoom", zoomBehavior));
	var outerDisplay = buildDisplay(svg, num.id, true);
	var innerDisplay = buildDisplay(outerDisplay, num.translate(0.5 * config.editWidth, 0.5 * config.editHeight));

	return svgDrawer(innerDisplay, options);
};