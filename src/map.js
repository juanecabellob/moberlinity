// TODO: Create helpers and put me there
//const pathColors = [ '#815da6', '#599ba9', '#54bd36', '#530101', '#add5c5', '#919b30', '#cd7d84', '#855c51', '#f011ed', '#b54a71', '#6294e3' ];

function Map() {
  let instance;

  Map = function() {
    return instance;
  }

  Map.prototype = this;

  instance = new Map();

  // TODO: Load initial coordinates from config
  instance.centralMarkerCoordinates = [52.5198165, 13.3601785];
  instance.constructor = Map;
  instance.map;
  instance.currentRadius = 5; // unit: kilometers
  instance.bufferedPoints;
  instance.layers = {
    tile: null,
    centralMarker: null,
    circleArea: null,
    simulationPaths: null,
    simulationMarkers: {
      citizens: null,
      vehicles: null,
      places: null
    },
    simulationRidesDurationMarkers: null,
    metro: [],
    metroStations: null
  };
  Map.instance = instance;

  return instance;
}

/**
 * Creates map and sets central marker object
 */
Map.prototype.createMap = function() {
  // TODO: Move to config
  L.mapbox.accessToken = 'pk.eyJ1IjoianVhbmVjYWJlbGxvYiIsImEiOiJjajRqdXI1bjEwbnZwMnFvNzlsZDN1MzliIn0.BRkacCy_B0Yvz-6nR8wYuQ';
  this.map = L.mapbox.map('app').setView(this.centralMarkerCoordinates, 13);
  this.layers.tile = L.tileLayer('https://api.tiles.mapbox.com/v4/{id}/{z}/{x}/{y}.png?access_token={accessToken}', {
    attribution: 'Map data &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors, <a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, Imagery © <a href="http://mapbox.com">Mapbox</a>',
    maxZoom: 18,
    id: 'mapbox.streets',
    accessToken: L.mapbox.accessToken
  });
  this.map.addLayer(this.layers.tile);
  this.layers.centralMarker = L.marker(new L.LatLng(...this.centralMarkerCoordinates), {
    icon: L.mapbox.marker.icon({
        'marker-color': '#00704A',
        'title': 'Entry point',
        'marker-size': 'large',
        'marker-symbol': 'marker-stroked'
    }),
    draggable: true,
    zIndexOffset: 999
  });
  this.layers.centralMarker.on('drag', () => {
    this.drawCircleArea();
  });
  
  this.map.addLayer(this.layers.centralMarker);
  // TODO: to optimize performance use the express server to do calculations of 
  /*request.get('http://localhost:3000/berlin-ubahn.json')
    .then((data) => {
      this.layers.metro = data.body.map(lineString => L.mapbox.featureLayer().setGeoJSON(turf.featureCollection([lineString])));
      this.layers.metro.map(layer => this.map.addLayer(layer));
    })
    .catch((err) => {
      console.log(err);
    });
  request.get('http://localhost:3000/berlin-stations.json')
    .then((data) => {
      this.layers.metroStations = L.mapbox.featureLayer().setGeoJSON(turf.featureCollection(data.body));
      console.log(this.layers.metroStations);
      this.map.addLayer(this.layers.metroStations);
    })
    .catch((err) => {
      console.log(err);
    });*/
  this.map.on('click', (e) => {
    this.centralMarkerCoordinates = [ e.latlng.lat, e.latlng.lng ];
    this.layers.centralMarker.setLatLng(this.centralMarkerCoordinates);
    this.map.setView(this.centralMarkerCoordinates, 13);
    this.drawCircleArea();
  });

  this.drawCircleArea();
};


/**
 * Adds a layer that contains the circle created by {@link createPointBuffer} to the map
 */
Map.prototype.drawCircleArea = function() {
  const point = this.getCentralMarkerPoint();
  if (this.layers.circleArea !== null) {
    this.map.removeLayer(this.layers.circleArea);
  } 

  this.bufferedPoints = this.createPointBuffer(point, this.currentRadius, 120, 'kilometers');
  this.bufferedPoints.properties = {
      'fill': 'blue',
      'fill-opacity': 0.05,
      'stroke': 'blue',
      'stroke-width': 2,
      'stroke-opacity': 0.7
  };
  this.layers.circleArea = L.mapbox.featureLayer().setGeoJSON(this.bufferedPoints);
  this.addLayer(this.layers.circleArea);
}

/**
 *  Retrieves the point object of the central marker
 *  @return object - point object of the central marker
 */
Map.prototype.getCentralMarkerPoint = function() {
  const position = this.layers.centralMarker.getLatLng(),
      point = turf.point([ position.lng, position.lat ]);
  return point;
}

/**
 * Generates a point buffer which has a circle form
 * @return object - polygon object that contains all the buffered points
 */
Map.prototype.createPointBuffer = function(point, radius, resolution, units) {
  let ring = [],
      resMultiple = 360/resolution;
  for (var i = 0; i < resolution; i++) {
    const spoke = turf.destination(point, radius, i*resMultiple, units);
    ring.push(spoke.geometry.coordinates);
  }
  // Connects edges
  if ((ring[0][0] !== ring[ring.length-1][0]) && (ring[0][1] != ring[ring.length-1][1])) {
    ring.push([ring[0][0], ring[0][1]]);
  }

  return turf.polygon([ring]);
}

Map.prototype.addLayer = function(layer) {
  this.map.addLayer(layer);
}

Map.prototype.getSimulationMarkersGeoJSON = function(markerType) {
  return this.layers.simulationMarkers[markerType].getGeoJSON();
}

Map.prototype.getSimulationPathsGeoJSON = function(pathNumber) {
  return this.layers.simulationPaths[pathNumber].getGeoJSON();
}

Map.prototype.clearSimulationLayers = function() {
  _.keys(this.layers.simulationMarkers).map(markerKey => this.layers.simulationMarkers[markerKey]).forEach((layer) => {
    layer && layer.clearLayers();
    layer = null;
  });

  _.keys(this.layers.simulationPaths).map(pathKey => this.layers.simulationPaths[pathKey]).forEach((layer) => {
    layer && layer.clearLayers();
    layer = null;
  });


  _.keys(this.layers.simulationRidesDurationMarkers).map(durationMarkerKey => this.layers.simulationRidesDurationMarkers[durationMarkerKey]).forEach((layer) => {
    layer && this.map.removeLayer(layer);
  });

  _.keys(this.layers.simulationPaths).map(pathKey => delete this.layers.simulationPaths[pathKey]);
  _.keys(this.layers.simulationRidesDurationMarkers).map(durationMarkerKey => delete this.layers.simulationRidesDurationMarkers[durationMarkerKey]);
}

Map.prototype.getBufferedPoints = function() {
  return this.bufferedPoints;
}

Map.prototype.setAndAddSimulationMarkerFeatureCollection = function(markerType, markersAsfeatureCollection) {
  if (!(markerType in _.keys(this.layers.simulationMarkers))) {
    // TODO: Error handling
    return false;
  }

  this.layers.simulationMarkers[markerKey] = L.mapbox.featureLayer().setGeoJSON(markersAsfeatureCollection);
  this.addLayer(this.layers.simulationMarkers[markerKey]);
}

Map.prototype.setAndAddSimulationPathFeatureCollection = function(rideId, pathAsFeatureCollection) {
  // TODO: bind ride ID to the properties for better search
  this.layers.simulationPaths[rideId] = L.mapbox.featureLayer().setGeoJSON(pathAsFeatureCollection);
  this.addLayer(this.layers.simulationPaths[rideId]);
}

Map.prototype.updateMarkerCoordinates = function(markerType, id, newCoordinates) {
  if (!(markerType in _.keys(this.layers.simulationMarkers))) {
    // TODO: Error handling
    return false;
  }

  let markers = this.getSimulationMarkersGeoJSON(markerType);
  markers.features.filter((feature) => feature.properties.id === id)[0].geometry.coordinates = newCoordinates;
  this.setAndAddSimulationMarkerFeatureCollection(markerType, markers);
}

Map.prototype.createAndAddSimulationRideDurationFeature = function(rideId, coordinates) {
  // TODO: bind ride ID to the properties for better search
  let durationMarker = L.marker(coordinates, {
        icon: L.divIcon({
          className: 'distance-icon',
          html: `<strong style="color: ${pathColors[iteration]}">${totalRideDurationParsed}</strong>`,
          iconSize: [60, 23]
        })
      });
  this.layers.simulationRidesDurationMarkers[rideId] = durationMarker;
}

Map.prototype.removeSimulationRideDurationMarker = function(rideId) {
  // TODO: Error handling
  this.map.removeLayer(this.layers.simulationRidesDurationMarkers[rideId]);
  delete this.layers.simulationRidesDurationMarkers[rideId];  
}

Map.prototype.removeSimulationRidePath = function(rideId) {
  // TODO: Error handling
  this.layers.simulationPaths[rideId].clearLayers();
  delete this.layers.simulationPaths[rideId];
}

Map.prototype.removeSimulationRideLayers = function(rideId) {
  this.removeSimulationRidePath(rideId);
  this.removeSimulationRideDurationMarker(rideId);
}

/**
 * Binds to the mousewheel event a function that adapts the area of the circle
 * @todo: undo jquery
 */
$('.leaflet-marker-draggable').on('mousewheel', function(e){
    let wheelDelta= e.originalEvent.wheelDeltaY;
    if (this.currentRadius - wheelDelta * 0.001 >= 0.2 && this.currentRadius - wheelDelta * 0.001 <= 8 && !onSimulation) {
      this.currentRadius = this.currentRadius - wheelDelta * 0.001;
      this.drawCircleArea();
    }

    e.stopPropagation();
  });