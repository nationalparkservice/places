iD.TileLayer = function() {
    var tileSize = 256,
        tile = d3.geo.tile(),
        tileMath = iD.tileMath,
        projection,
        cache = {},
        utfGrid = {},
        tileOrigin,
        z,
        transformProp = iD.util.prefixCSSProperty('Transform'),
        source = d3.functor('');


    function tileSizeAtZoom(d, z) {
        return Math.ceil(tileSize * Math.pow(2, z - d[2])) / tileSize;
    }

    function atZoom(t, distance) {
        var power = Math.pow(2, distance);
        return [
            Math.floor(t[0] * power),
            Math.floor(t[1] * power),
            t[2] + distance];
    }

    function lookUp(d) {
        for (var up = -1; up > -d[2]; up--) {
            var tile = atZoom(d, up);
            if (cache[source.url(tile)] !== false) {
                return tile;
            }
        }
    }

    function uniqueBy(a, n) {
        var o = [], seen = {};
        for (var i = 0; i < a.length; i++) {
            if (seen[a[i][n]] === undefined) {
                o.push(a[i]);
                seen[a[i][n]] = true;
            }
        }
        return o;
    }

    function addSource(d) {
        d.push(source.url(d));
        d.push(source.url(d, 'templateGrid'));
        return d;
    }

    // Update tiles based on current state of `projection`.
    function background(selection) {
        tile.scale(projection.scale() * 2 * Math.PI)
            .translate(projection.translate());

        tileOrigin = [
            projection.scale() * Math.PI - projection.translate()[0],
            projection.scale() * Math.PI - projection.translate()[1]];

        z = Math.max(Math.log(projection.scale() * 2 * Math.PI) / Math.log(2) - 8, 0);

        render(selection);
    }

    // Derive the tiles onscreen, remove those offscreen and position them.
    // Important that this part not depend on `projection` because it's
    // rentered when tiles load/error (see #644).
    function render(selection) {
        var requests = [];

        if (source.validZoom(z)) {
            tile().forEach(function(d) {
                addSource(d);
                if (d[3] === '') return;
                if (typeof d[3] !== 'string') return; // Workaround for chrome crash https://github.com/openstreetmap/iD/issues/2295
                requests.push(d);
                if (cache[d[3]] === false && lookUp(d)) {
                    requests.push(addSource(lookUp(d)));
                }
            });

            requests = uniqueBy(requests, 3).filter(function(r) {
                // don't re-request tiles which have failed in the past
                return cache[r[3]] !== false;
            });
        }

        var pixelOffset = [
            Math.round(source.offset()[0] * Math.pow(2, z)),
            Math.round(source.offset()[1] * Math.pow(2, z))
        ];

        function load(d) {
            cache[d[3]] = true;
            d3.select(this)
                .on('error', null)
                .on('load', null)
                .on('mousemove', function (d) { console.log('MOUSE', d); })
                .classed('tile-loaded', true);
            render(selection);
        }

        function error(d) {
            cache[d[3]] = false;
            d3.select(this)
                .on('error', null)
                .on('load', null)
                .remove();
            render(selection);
        }

        function imageTransform(d) {
            var _ts = tileSize * Math.pow(2, z - d[2]);
            var scale = tileSizeAtZoom(d, z);
            return 'translate(' +
                (Math.round((d[0] * _ts) - tileOrigin[0]) + pixelOffset[0]) + 'px,' +
                (Math.round((d[1] * _ts) - tileOrigin[1]) + pixelOffset[1]) + 'px)' +
                'scale(' + scale + ',' + scale + ')';
        }

        var image = selection
            .selectAll('img')
            .data(requests, function(d) { 
              // Load the utfGrid when it tries to load the image
              if (d[4]) {
                // Fill out the JSON grid cache
                utfGrid[d[2]] = utfGrid[d[2]] || {};
                utfGrid[d[2]][d[0]] = utfGrid[d[2]][d[0]] || {};
                if (utfGrid[d[2]][d[0]][d[1]]) {
                  console.log('reading data', utfGrid[d[2]][d[0]][d[1]]);
                } else {
                  utfGrid[d[2]][d[0]][d[1]] = 'loading';
                  d3.json(d[4], function (e, r) {
                    utfGrid[d[2]][d[0]][d[1]] = e ? {'error': e, 'tile': d} : r;
                    console.log('adding data', utfGrid[d[2]][d[0]][d[1]]);
                  });
                }
              }
              return d[3];
            });

        image.exit()
            .style(transformProp, imageTransform)
            .classed('tile-removing', true)
            .each(function() {
                var tile = d3.select(this);
                window.setTimeout(function() {
                    if (tile.classed('tile-removing')) {
                        tile.remove();
                    }
                }, 300);
            });

        image.enter().append('img')
            .attr('class', 'tile')
            .attr('src', function(d) { return d[3]; })
            .on('error', error)
            .on('load', load);

        image
            .style(transformProp, imageTransform)
            .classed('tile-removing', false);
    }

    background.projection = function(_) {
        if (!arguments.length) return projection;
        projection = _;
        return background;
    };

    background.dimensions = function(_) {
        if (!arguments.length) return tile.size();
        tile.size(_);
        return background;
    };

    background.source = function (_) {
      source.utfGridCache = function (coords, zoom) {
        var grid;
        var getTile = function (lon, lat, z) {
          lat = parseFloat(lat, 10);
          lon = parseFloat(lon, 10);
          z = parseInt(z, 10);
          var tileAddress = [z, tileMath.long2tile(lon, z), tileMath.lat2tile(lat, z)];
          var tile = utfGrid[tileAddress[0]] && utfGrid[tileAddress[0]][tileAddress[1]] && utfGrid[tileAddress[0]][tileAddress[1]][tileAddress[2]];
          var dimension = 256;
          var resolution = 4;
          var tileBounds = {
            north: tileMath.tile2lat(tileAddress[2], z),
            south: tileMath.tile2lat(tileAddress[2] + 1, z),
            west: tileMath.tile2long(tileAddress[1], z),
            east: tileMath.tile2long(tileAddress[1] + 1, z)
          };
          console.log('tile', tileAddress);
          console.log('lat', ((lat - tileBounds.north) / (tileBounds.south - tileBounds.north))*(dimension/resolution));
          console.log('lon', ((lon - tileBounds.east) / (tileBounds.west - tileBounds.east))*(dimension/resolution));
          return tile;

        };
        var returnValue = utfGrid;
        if (coords && zoom) {
          returnValue = getTile(coords[0], coords[1], zoom) || getTile(coords[0], coords[1], zoom + 1) || getTile(coords[0], coords[1], zoom - 1);
        }
        return returnValue;
      };

        if (!arguments.length) return source;
        source = _;
        cache = {};
        tile.scaleExtent(source.scaleExtent);
        return background;
    };


    return background;
};
