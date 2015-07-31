// drag handler for translation, attached to top level g element
var dragMove = d3.behavior.drag()
.origin(function() {
	return {x: 0, y: 0}
})
.on("drag", function(d,i) {
	// update x y coordinates
	d.transform = num.translateBy(d.transform, d3.event.dx, d3.event.dy);
	d3.select(this).attr("transform", num.getTransform);
})
.on("dragstart", function(d, i) {
	// ui updates
	d3.select(this).moveToFront();
	d3.select(this).classed("translucent", true);

	d.startTime = new Date().getTime();

	// if edge is under cursor, save it into global var hover
	var hoveredNode = d3.select(".hover").node();
	if (hoveredNode) {
		hover = {
			node: hoveredNode,
			time: (new Date()).getTime()
		};
	}
	// prevent pointer events from trickling
	d3.event.sourceEvent.stopPropagation();
	d3.select(this).attr('pointer-events', 'none');
})
.on("dragend", function(d, i) {
	// restore ui
	d3.select(this).classed("translucent", false);
	d3.select(this).attr('pointer-events', '');

	var isClick = (new Date()).getTime() - d.startTime < config.clickThreshold;

	// enter canvas if hover group originates from palette
	if (!isClick && this.parentNode === assemblePaletteContainer.node()) {
		enterCanvas(this);
		selection.clear();
	}

	if (hover) {
		d3.select(hover.node).classed("hover", false);

		// mouse was over an edge or an interior during the drag

		switch (hover.node.tagName) {
		// click/drag on an edge
		case 'line':
			if (candidate && !d3.select(hover.node).classed("joined")) {
				// edge dragged onto another edge
				// equivalent to clicking both edges in quick succession
				selection.clear();
				edgeClick(hover.node);
				edgeClick(candidate);
			} else if (isClick) {
				selection.clear("group");
				edgeClick(hover.node);
			} else {
				selection.clear();
			}
			break;
		// click/drag on an interior
		case 'path':
			if (hover.node.classList.contains("interior") && isClick) {
				var isReclick = selection.clear();
				selection.set(hover.node.parentNode.parentNode, {type: "group",
					isReclick: isReclick});
			}
			break;
		}
	}
	hover = null;
	checkRep();
});

// drag handler for rotation, attached to vertex element
var dragRotate = d3.behavior.drag()
.on("drag", function(d,i) {
	// update rotation
	var angle = num.getAngle(d3.event.x, d3.event.y) - num.getAngle(d.x, d.y);
	d3.select(this.parentNode.parentNode)
	.attr("transform", function(d) {
		d.transform = num.rotateBy(d.transform, angle);
		return num.getTransform(d);
	});
})
.on("dragstart", function() {
	d3.select("body")
	.style("cursor", "all-scroll");
	d3.event.sourceEvent.stopPropagation();
	centerCoords(this.parentNode);
})
.on("dragend", function() {
	d3.select("body")
	.style("cursor", "auto");
});

// drag handler for editing shape, attached to vertex element
var dragEdit = d3.behavior.drag()
.on("drag", function(d,i) {
	updateVertexAndEdgeEnds(d, i);
})
.on("dragstart", function(d, i) {
	d3.select("body")
	.style("cursor", "all-scroll");
})
.on("dragend", function(d, i) {
	d3.select("body")
	.style("cursor", "auto");

	updateDimensions(this.parentNode.__data__);
});

// drag handler for editing custom pattern handles
var dragPatternHandleEdit = d3.behavior.drag()
.on("dragstart", function(d, i) {
	var thisTemplate = this.parentNode.__data__;
	var tile = this.parentNode.parentNode.__data__;
	var thisIndex = _.findIndex(tile.customTemplate, function(t) { return t === thisTemplate; });
	if (!$("#customPatternSelect").val() || $("#customPatternSelect").val().length !== 1 ||
		// update UI
		$("#customPatternSelect").val()[0] !== ""+thisIndex) {
		$("#customPatternSelect").val(thisIndex);
		$(":radio[value=" + thisTemplate.edgesSpec + "]").prop("checked", true);
		$(":radio[value=" + thisTemplate.symmetrySpec + "]").prop("checked", true);
		$("#patternInterval").val(thisTemplate.patternInterval);
		$("#patternStart").val(thisTemplate.startEdge);
		$("#patternDepth").val(thisTemplate.patternDepth);
		$("#manualEdges").val(JSON.stringify(thisTemplate.applicableEdges));
		startOffset.setValue(thisTemplate.startProportion - 0.5);
		endOffset.setValue(thisTemplate.endProportion - 0.5);
		degreesOfFreedom.setValue(thisTemplate.points.length);
	}

	d3.select(this.parentNode.parentNode).selectAll("g.patternHelper").classed("active", false);
	d3.select(this.parentNode).classed("active", true);

})
.on("drag", function(d, i) {
	d.transform = num.translateBy(d.transform, d3.event.dx, d3.event.dy);
	d3.select(this).attr("transform", num.getTransform);

	var tile = this.parentNode.parentNode.__data__;

	patternFn = makePatterns(_.last(patternOptions).generator(tile));
	polygonAddPattern(tile, patternFn);
	patternEditSVGDrawer.redrawPatterns(true);
});

// zoom handler for canvas
var zoomBehavior = function(d, i) {
	d3.select(this.parentNode).selectAll(".canvas").each(function(d) {
		d.transform = num.translateBy(num.scaleBy(num.id, d3.event.scale), d3.event.translate[0], d3.event.translate[1]);
	})
	.attr("transform", num.getTransform);
};

// zoom handler for palette, only enable y panning
var zoomPalette = d3.behavior.zoom()
.on("zoom", function(d, i) {
	var ty = zoomPalette.translate()[1];

	ty = Math.min(ty, 0);
	if (config.standardHeight < assemblePaletteContainer.node().getBBox().height + 2 * config.sidebarSpacing) {
		ty = Math.max(ty, config.standardHeight - assemblePaletteContainer.node().getBBox().height - 2 * config.sidebarSpacing);
	} else {
		ty = Math.max(ty, 0);
	}
	// ty = Math.max(ty, )
	zoomPalette.translate([0, ty]);

	assemblePaletteContainer.each(function(d) {
		d.transform = num.translateBy(d.scaledTransform, 0, zoomPalette.translate()[1]);
	})
	.attr("transform", num.getTransform);
});

// click handler for joining edges, attached to edge element
var edgeClick = function(thisNode) {
	// if other edge already exists
	if (selection.get() && selection.get().type === "edge") {
		if (thisNode === selection.get().edgeNode) {
			selection.clear();
		} else {
			joinEdges(thisNode, selection.get());
			selection.clear();
		}
	} else if (d3.select(thisNode).classed("joined")) {
		breakEdges(thisNode);
		selection.clear();
	} else {
		selection.set(thisNode, {type: "edge"});
	}
};

// select the group
var groupClick = function(d, i) {
	selection.clear();
	selection.set(this, {type: "group"});
};

// mouseover handler for edge handle node
var handleMouseover = function(edgeNode) {
	if (hover && edgeNode !== hover.node && !d3.select(edgeNode).classed("joined")) {
		candidate = edgeNode;
	}
	d3.select(edgeNode).classed('hover', true);
};

// mouseout handler for edge handle node
var handleMouseout = function(edgeNode) {
	candidate = null;
	if (!hover || (edgeNode !== hover.node)) {
		d3.select(edgeNode).classed('hover', false);
	}
};

// clicking a pattern
var patternClick = function(thisNode) {
	assignStripColor(thisNode, $("#colorpicker").val());
	updateStripTable();
};

var shapeDropdownChange = function(a, b, c, d, e) {
	var index = shapeDropdown.node().value;
	var currentOption = shapeOptions[index];
	assembleSVGDrawer.set(currentOption.polygons());
	assembleSVGDrawer.draw();

	if (currentOption.name === "Custom") {
		$("#customShape").collapse("show");
		bindButtonToAddNewShape();
	} else {
		$("#customShape").collapse("hide");
	}

	selection.clear();
};

var shapeEditCustomDraw = function() {
	shapeEditSVGDrawer.set([regularPolygon(parseInt(sideNumberSlider.getValue(), 10), parseFloat(sideLengthSlider.getValue()))]);
	shapeEditSVGDrawer.draw();
};

var patternDropdownChange = function() {

	var index = patternDropdown.node().value;
	var motif = patternOptions[index];
	var tile = patternEditSVGDrawer.getTile();
	var n = tile.vertices.length;

	if (motif.parameters.length === 2) {
		// regular motif option with parameters
		d3.selectAll("#presets").style("display", "block");
		d3.selectAll("#inferText").style("display", "none");
		d3.selectAll("#customPattern").style("display", "none");
		patternSlider1.destroy();
		patternSlider2.destroy();

		d3.select("#patternLabel1").text(motif.parameters[0].name);
		patternSlider1 = new Slider("#patternSlider1", motif.parameters[0].options(n))
		.on("change", patternUpdate);

		d3.select("#patternLabel2").text(motif.parameters[1].name);
		patternSlider2 = new Slider("#patternSlider2", motif.parameters[1].options(n))
		.on("change", patternUpdate);
	} else {
		d3.selectAll("#presets").style("display", "none");
		if (motif.name === "Custom") {
			d3.selectAll("#inferText").style("display", "none");
			d3.selectAll("#customPattern").style("display", "block");
		} else {
			d3.selectAll("#inferText").style("display", "block");
			d3.selectAll("#customPattern").style("display", "none");
		}
	}

	patternUpdate();

	if (motif.name === "Custom") {
		patternMultiSelectUpdate(tile.customTemplate);
	}
};

var patternMultiSelectUpdate = function(customTemplate) {
	// now that customTemplate is populated
	var sel = d3.select("#customPatternSelect").selectAll("option")
	.data(customTemplate);

	sel
	.enter()
	.append("option");

	sel
	.attr("value", function(d, i) { return i; })
	.html(function(d, i) { return "Pattern " + (i+1); });

	sel.exit().remove();

	sel.filter(function(d, i) { return i === 0;})
	.attr("selected", true);
};

var patternUpdate = function() {
	var index = patternDropdown.node().value;
	var motif = patternOptions[index];
	var tile = patternEditSVGDrawer.getTile();
	var patternFn;

	if (motif.name === "Custom") {
		patternFn = makePatterns(motif.generator(tile));
	} else {
		patternFn = makePatterns(motif.generator(tile, patternSlider1.getValue(), patternSlider2.getValue()));
	}
	polygonAddPattern(tile, patternFn);
	patternEditSVGDrawer.redrawPatterns();
};

var addToLineupClick = function() {
	pushPolygonToLineup(_.cloneDeep(shapeEditSVGDrawer.getTile()));
};

var addToLineupManualClick = function() {
	pushManualPolygonToLineup($("#sidelengths").val(), $("#interiorAngles").val());
};

var updateShapeClick = function() {
	var newTile = shapeEditSVGDrawer.getTile();
	var index = selection.index();
	shapeSVGDrawer.replace(newTile);
	shapeSVGDrawer.draw();
	selection.set(shapeSVGDrawer.container.selectAll("g.group")[0][index], {type: "group", updatePatternDisplay: false});
};


var updateTileWithPatternClick = function() {
	var motifIndex = patternDropdown.node().value;
	var motif = patternOptions[motifIndex];

	var newTile = patternEditSVGDrawer.getTile();
	polygonAddPatternMetadata(newTile);
	newTile.patternParams = {
		index: motifIndex,
		param1: patternSlider1.getValue(),
		param2: patternSlider2.getValue()
	};
	var index = selection.index();
	assembleSVGDrawer.replace(newTile);
	assembleSVGDrawer.draw();
	$("#patternModal").modal('hide');
	selection.set(assembleSVGDrawer.container.selectAll("g.group")[0][index], {type: "group", updatePatternDisplay: false});

	var tilesInCanvas = assembleCanvas.selectAll("g.tile").filter(function(d, i) { return d.polygonID === newTile.polygonID; });

	tilesInCanvas.each(function(d, i) {
		d3.select(this).selectAll("path.pattern").remove();
		d.customTemplate = _.cloneDeep(newTile.customTemplate);
		var patterns = motif.generator(d, patternSlider1.getValue(), patternSlider2.getValue());
		polygonAddPattern(d, makePatterns(patterns));
		d.patternParams = _.cloneDeep(newTile.patternParams);
		polygonAddPatternMetadata(d);
		drawPatterns(d3.select(this), {});
	});

};

var newCustomPatternClick = function() {
	var newPattern = {
		startEdge: 0,
		patternDepth: 1,
		patternInterval: 2,
		startProportion: 0.5,
		endProportion: 0.5,
		isSymmetric: true,
		isCropped: true,
		symmetrySpec: "mirrorNoCrop",
		edgesSpec: "manual",
		applicableEdges: [[0,1]],
		points: _.map([[-20, 20]], function(t) {
			return {transform: num.translate(t)};
		})
	};

	var tile = patternEditSVGDrawer.getTile();
	tile.customTemplate.push(newPattern);
	patternUpdate();
	patternMultiSelectUpdate(tile.customTemplate);
};

var deleteCustomPatternClick = function() {
	var tile = patternEditSVGDrawer.getTile();
	tile.customTemplate = _.filter(tile.customTemplate, function(template, index) {
		return !_.find($("#customPatternSelect").val(), function(i) {
			return i === index+"";
		});
	});
	$("#customPatternSelect").val([]);
	patternUpdate();
	patternMultiSelectUpdate(tile.customTemplate);
}

var copyHandler = function(d, i) {
	if (selection.get().groupNode.parentNode === assembleCanvas.node()) {
		selection.copy();
	} else if (selection.get().groupNode.parentNode === assemblePaletteContainer.node()) {
		selection.copy(assembleSVGDrawer);
	}
};

var deleteHandler = function(d, i) {
	if (selection.get().groupNode.parentNode === assembleCanvas.node()) {
		// if there are no more inferTiles in the canvas, hide the infer button
		var inferTiles = assembleCanvas.selectAll("g.tile").filter(function(d, i) { return d.infer; });
		if (_.flatten(inferTiles).length === 0) {
			inferButton.classed("hidden", true);
		}
		selection.delete();
	} else if (selection.get().groupNode.parentNode === assemblePaletteContainer.node()) {
		selection.delete(assembleSVGDrawer);
	}
};

var inferHandler = function(d, i) {
	var inferTiles = assembleCanvas.selectAll("g.tile").filter(function(d, i) { return d.infer; });
	if (_.flatten(inferTiles).length === 0) {
		alert("No tiles are on the inferred setting.");
	}
	inferTiles.each(function(d, i) {
		d3.select(this).selectAll("path.pattern").remove();

		var allRays = [];
		_.each(d.edges, function(edge, edgeIndex) {
			if (edge.joinedTo) {
				var otherEdge = edge.joinedTo.__data__;
				_.each(otherEdge.patterns, function(p) {
					allRays.push(rotatedRay(p.angle - Math.PI / 2, p.proportion)(edge, edgeIndex));
				});
			}
		});

		var greedy = greedyInference(allRays);

		var generator = _.map(greedy, function(pair) {
			return {
				start: {
					index: pair.rays[0].index,
					proportion: pair.rays[0].offset
				},
				end: {
					index: pair.rays[1].index,
					proportion: pair.rays[1].offset
				},
				template: pair.template,
				isSymmetric: false,
				isCropped: false,
				isAbsolute: true
			};
		});

		polygonAddPattern(d, makePatterns(generator));
		polygonAddPatternMetadata(d);
		drawPatterns(d3.select(this), {});
	});
};

var thicknessSliderChange = function() {
	d3.selectAll("path.strip").style("stroke-width", thicknessSlider.getValue());
	d3.selectAll("path.strip-outline").style("stroke-width", thicknessSlider.getValue() + 1);
};

var extensionSliderChange = function() {
	traceCanvas.selectAll("path").remove();
	resetAndDraw(traceCanvas, _.cloneDeep(polylist), tracePatternOptions);
	colorMap = _.map(stripColors, function(c) {
		return {
			color: c,
			strips: []
		};
	});
	d3.select("#noneSoFar").style("display", "block");
	d3.select("#stripTable").selectAll("div").remove();
	redrawCanvas();
};

// toggle visibility of edges and vertices
var shapeEditToggle = function() {
	var s =	d3.select(shapeEditSVGDrawer.getTile().this).selectAll(".label")
	.attr("visibility", shapeEditToggleButton.classed("active") ? "hidden" : "visible");
};

var tileViewClick = function() {
	assembleCanvas
	.each(function(d, i) {
		d.transform = traceCanvas.datum().transform;
	})
	.attr("transform", num.getTransform);

	stripView.classed("active", false);
	d3.select("#assembleTab").classed("active", true).classed("hidden", false);
	d3.select("#traceTab").classed("active", false).classed("hidden", true);
};

var stripViewClick = function() {
	traceCanvas.selectAll("path").remove();
	resetAndDraw(traceCanvas, _.cloneDeep(polylist), tracePatternOptions);
	traceCanvas
	.each(function(d, i) {
		d.transform = assembleCanvas.datum().transform;
	})
	.attr("transform", num.getTransform);
	colorMap = _.map(stripColors, function(c) {
		return {
			color: c,
			strips: []
		};
	});
	d3.select("#noneSoFar").style("display", "block");
	d3.select("#stripTable").selectAll("div").remove();
	redrawCanvas();

	tileView.classed("active", false);
	d3.select("#assembleTab").classed("active", false).classed("hidden", true);
	d3.select("#traceTab").classed("active", true).classed("hidden", false);
};