
var deepCustomizer = function(includeVertices) {
	return function(val, id, obj) {
		var clone = {};
		if (val === null) {
			return null;
		} else if (_.isElement(val)) {
			// when deepcloning, drop DOM nodes
			return null;
		// if val is a pattern object
		} else if (_.isElement(val.this) && val.this.classList.contains("pattern")) {
			// drop DOM node, copy everything over (shallow clone)
			// except for start and end: decircularize by collapsing reference into an index
			for (var prop in val) {
				if (prop === "end" || prop === "start") {
					clone[prop] = {};
					for (var prop1 in val[prop]) {
						if (prop1 === "edge") {
							clone[prop][prop1] = val[prop][prop1].index;
						} else {
							clone[prop][prop1] = val[prop][prop1];
						}
					}
				} else if (_.isElement(val[prop])) {
					clone[prop] = null;
				} else {
					clone[prop] = val[prop];
				}
			}
			return clone;
		// if val is an edge object
		} else if (_.isElement(val.this) && val.this.classList.contains("edge")) {
			for (var prop in val) {
			// drop DOM node, copy everything over (shallow clone)
			// except for patterns: decircularize by collapsing reference into an index
				if (prop === "patterns") {
					clone[prop] = _.map(val[prop], function(p) {
						return _.cloneDeep(p, function(val, id, obj) {
							if (id === "pattern") {
								return val.index;
							}
						});
					});
				} else if (_.isElement(val[prop])) {
					clone[prop] = null;
				} else {
					clone[prop] = val[prop];
				}
			}
			return clone;
		// if val is a vertex object
		} else if (_.isElement(val.this) && val.this.classList.contains("vertex")) {
			if (includeVertices) {
				// drop DOM node, copy everything over (shallow clone)
				for (var prop in val) {
					if (_.isElement(val[prop])) {
						clone[prop] = null;
					} else {
						clone[prop] = val[prop];
					}
				}
				return clone;
			} else {
				return null;
			}
		}
	};
};

var isNode = function(o){
  return (
    typeof Node === "object" ? o instanceof Node :
    o && typeof o === "object" && typeof o.nodeType === "number" && typeof o.nodeName==="string"
  );
};

var reduceCircularity = function(tile) {

	var tileCopy = _.cloneDeep(tile);
	_.each(tileCopy.patterns, function(p, index) {
		p.end.edge = p.end.edge.index; // replace reference with id
		p.start.edge = p.start.edge.index;
		p.index = index;
		_.each(p.intersectedVertices, function(iv) {
			delete iv.p;
		});
	});

	_.each(tileCopy.edges, function(e) {
		_.each(e.patterns, function(p) {
			p.pattern = p.pattern.index;
		});
	});

	return tileCopy;
};

var circularize = function(tile) {

	_.each(tile.patterns, function(p, index) {
		p.end.edge = tile.edges[p.end.edge]; // dereference index
		p.start.edge = tile.edges[p.start.edge];
	});

	_.each(tile.edges, function(e) {
		_.each(e.patterns, function(p) {
			p.pattern = tile.patterns[p.pattern];
		});
	});

	return tile;
};

// used for circularizing tiles on the canvas, which have been flattened
// via deepCopy
var canvasCircularize = function(tile) {

	_.each(tile.patterns, function(p, index) {
		p.end.edge = tile.edges[p.end.edge.index]; // dereference index
		p.start.edge = tile.edges[p.start.edge.index];
	});

	_.each(tile.edges, function(e) {
		_.each(e.patterns, function(p) {
			p.pattern = tile.patterns[p.pattern.index];
		});
	});

	return tile;
};

var loadFromJson = function(loaded, callback) {
	if (loaded.version >= minSupportedVersion) {
		d3.select(".loading-overlay").classed("in", true);

		var canvasTransform = loaded.canvasTransform;

		assembleCanvas.each(function(d) {
			d.transform = canvasTransform;
		})
		.attr("transform", num.getTransform);
		commonZoomHandler.scale(num.getScale(canvasTransform));
		commonZoomHandler.translate(num.getTranslation(canvasTransform));

		var palette = loaded.palette;
		_.each(palette, circularize);
		polygonID = _.max(_.pluck(palette, "polygonID")) + 1;

		if (loaded.version === 0.2) {
			polylist = loaded.polylist;
			_.each(polylist, function(group) {
				_.each(group.tiles, circularize);
			});
		} else {
			polylist = _.map(loaded.polylist, function(group) {
				group.tiles = _.map(group.tiles, function(tile, tileIndex) {
					var tileTemplate = _.find(palette, function(t) {
						return t.polygonID === tile.polygonID;
					});
					var tileTemplateCopy = _.clone(tileTemplate);
					tileTemplateCopy.edges = _.map(tileTemplate.edges, function(edge, edgeIndex) {
						var edgeCopy = _.clone(edge);
						edgeCopy.id = [tileIndex, edgeIndex];
						return edgeCopy;
					});
					tileTemplateCopy.patterns = _.map(tileTemplate.patterns, _.clone);
					tileTemplateCopy.transform = tile.transform;
					return tileTemplateCopy;
				});
				return group;
			});
		}

		resetAndDraw(assembleCanvas, polylist, assembleCanvasOptions);
		assembleSVGDrawer.set(palette);
		assembleSVGDrawer.draw();

		if (loaded.colorMap) {
			colorMap = loaded.colorMap;
			_.each(colorMap, function(c) {
				_.each(c.strips, function(s) {
					s.patternList = _.omit(_.map(s.patternList, function(p) {
						if (p) {
							return {assembleCounterpart: polylist[p[0]].tiles[p[1]].patterns[p[2]]};
						}
						return null;
					}), function(p) { return p === null; });
				});
			});
		}

		if (loaded.stripViewParams) {
			var p = loaded.stripViewParams;

			if (p.thickness) { thicknessSlider.setValue(p.thickness); }
			if (p.extension) { extensionSlider.setValue(p.extension); }
			if (p.stripHeight) { stripHeight.setValue(p.stripHeight); }
			if (p.widthFactor) { widthFactor.setValue(p.widthFactor); }
			if (p.interSpacing) { interSpacing.setValue(p.interSpacing); }
			if (p.printHeight) { printHeight.setValue(p.printHeight); }
			if (p.printWidth) { printWidth.setValue(p.printWidth); }
			if (typeof p.outline !== "undefined") {
				$("#outlineToggle").bootstrapSwitch('state', p.outline);
			}
		}

		updateInferButton();

		if (loaded.cropData) {
			setupCropOverlay();
			$("#cropMode").bootstrapSwitch('state', loaded.cropData.cropMode);

			cropData.vertices = _.map(d3.selectAll(".crop-vertex").filter(function(d) {
				return d.correspondsTo && _.any(loaded.cropData.vertices, function(v) {
					return v.x === d.x && v.y === d.y;
				});
			})[0], function(d) {
				return d.__data__;
			});
			recomputeHull();

			teardownCropOverlay();

			if (cropData.hullEdges.length > 2 && $("#cropMode").bootstrapSwitch("state") &&
				!$("#patternCroppingSwitch").bootstrapSwitch("state")) {
				$("#patternCroppingSwitch").bootstrapSwitch("state", true);
			}
		}

		var nonPlanarEdgeJoinsExist = false;
		d3.selectAll(".edge.joined").each(function(d) {
			nonPlanarEdgeJoinsExist = nonPlanarEdgeJoinsExist || !d.joinedTo.isPlanar;
		});
		if (nonPlanarEdgeJoinsExist && !$("#nonPlanarSwitch").bootstrapSwitch("state")) {
			$("#nonPlanarSwitch").bootstrapSwitch("state", true);
		}

		d3.select(".loading-overlay").classed("in", false);
		invalidateStripCache();

		if (callback) {
			callback();
		}

	} else {
		if (typeof loaded.version === "undefined") {
			loaded.version = "?";
		}
		d3.select(".loading-overlay").classed("in", false);
		throw {
			message: "File was from Sliceform Studio v" + loaded.version +
				" but only >=v" + minSupportedVersion + " is supported."
		};
	}
};

var generateAbridgedColorMap = function() {
	_.each(polylist, function(gp, gpIdx) {
		_.each(gp.tiles, function(tile, tileIdx) {
			_.each(tile.patterns, function(pattern, patternIdx) {
				pattern.uniqId = [gpIdx, tileIdx, patternIdx];
			});
		});
	});

	var colorMapCopy = _.map(colorMap, function(c) {
		return {
			color: c.color,
			strips: _.map(c.strips, function(s) {
			return {patternList: _.map(s.patternList, function(p) {
				return p.assembleCounterpart.uniqId;})};
			})
		};
	});

	_.each(polylist, function(gp, gpIdx) {
		_.each(gp.tiles, function(tile, tileIdx) {
			_.each(tile.patterns, function(pattern, patternIdx) {
				delete pattern.uniqId;
			});
		});
	});

	return colorMapCopy;
};

var saveToFileWithTitle = function(title) {

	var reducedPolylist = _.map(polylist, function(gp) {
		var gpClone = _.clone(gp);
		gpClone.tiles = _.map(gp.tiles, function(tile) {
			return {
				polygonID: tile.polygonID,
				transform: tile.transform
			};
		});
		return gpClone;
	});

	var nonCircularPalette = _.map(assembleSVGDrawer.get(), function(tile) {
		return reduceCircularity(tile);
	});

	var abridgedColorMap = generateAbridgedColorMap();

	var cropVertices = _.map(cropData.vertices, function(v) { return _.pick(v, _.isNumber); });

	var saveFile = {
		polylist: reducedPolylist,
		palette: nonCircularPalette,
		cropData: {
			vertices: cropVertices,
			cropMode: $("#cropMode").bootstrapSwitch("state")
		},
		colorMap: abridgedColorMap,
		canvasTransform: assembleCanvas.node().__data__.transform,
		version: wallpaperVersion,
		stripViewParams: {
			thickness: thicknessSlider.getValue(),
			extension: extensionSlider.getValue(),
			outline: $("#outlineToggle").bootstrapSwitch("state"),
			stripHeight: stripHeight.getValue(),
			widthFactor: widthFactor.getValue(),
			interSpacing: interSpacing.getValue(),
			printHeight: printHeight.getValue(),
			printWidth: printWidth.getValue()
		}
	};

	var saveFileText = JSON.stringify(saveFile, function(k,v) {
		return (isNode(v)) ? "tag" : v;
	});

	var bb = new Blob([saveFileText], {type: "application/json"});
	var pom = d3.select("#downloadLink").node();
	pom.download = title;
	pom.href = window.URL.createObjectURL(bb);
	pom.dataset.downloadurl = ["application/json", pom.download, pom.href].join(':');
	pom.click();
};

var getUrlVars = function() {
    var vars = [], hash;
    var hashes = window.location.href.slice(window.location.href.indexOf('?') + 1).split(/[&#]/);
    for(var i = 0; i < hashes.length; i++)
    {
        hash = hashes[i].split('=');
        vars.push(hash[0]);
        vars[hash[0]] = hash[1];
    }
    return vars;
};
