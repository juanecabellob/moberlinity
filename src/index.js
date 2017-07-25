// TODO: take into account the metro lines available
// TODO: select a simulation from history
// TODO: make a config 
const request = superagent; 

const simulationHistory = [];

let berlinUbahnMap;
// TODO: Create helpers and put me there
const pathColors = [ '#815da6', '#599ba9', '#54bd36', '#530101', '#add5c5', '#919b30', '#cd7d84', '#855c51', '#f011ed', '#b54a71', '#6294e3' ];

/**
 * Generates a random unique ID
 * @return string - Unique ID (non RFC4122 compliant)
 */
function getUID() {
  return Math.random().toString(36).substring(2) + (new Date()).getTime().toString(36);
}

function Simulation(rides) {
  
  this.rides = rides || null;
  this.totalSimulationDuration = 0;
  this.finishSimulation = null;

  this.maxSpeed = 45
  this.numberOfVehicles;
  this.numberOfCitizens;  
  
  this.currentSimulation;
  this.onSimulation = false;
  this.vehicles = [];
  this.places = [];
  this.citizens = [];
  this.paths = [];
  this.rides = [];  
  this.map = new Map();

  this.map.createMap();
  this.runningIntervalsAndTimeouts = {
    rideEnd: [],
    rideAnimation: {
      citizenToWaypoint: [],
      vehicleToDestination: [],
      secondAnimationStart: []
    },
    rideStart: null,
    simulationEnd: null
  }

} 

(function retrieveSimulations() {
  let options = [];
  let input = $('#history').empty();
  input.prepend($('<option></option>').attr('value', '').text('History'));
  for (let i = 0; i < localStorage.length; i ++) {
    let simulation = localStorage.getItem(localStorage.key(i));
    let simulationKey = localStorage.key(i);
    input.prepend($('<option></option>').attr('value', localStorage.length - 1 - i ).text(moment(simulationKey.split('#').reverse()[0]).fromNow()));
    simulationHistory.unshift(JSON.parse(simulation));
  }
})();

$('#history').change((e) => {
  let selectedText = $('#history option:selected').attr('value')
  // console.log(`something was selected ${JSON.stringify(simulationHistory[selectedText], null, 4)}`)
})

function Vehicle(location, status, battery) {
  this.id = getUID();
  this.location = location;
  this.status = status;
  this.battery = battery;
}

function Citizen(location, destination, vehicle) {
  this.id = getUID();
  this.vehicle = vehicle;
  this.location = location;
  this.destination = destination;
}

function Place(location) {
  this.id = getUID();
  this.location = location;
}

function Ride(simulationId, citizen, vehicle, finalLocation) {
  this.id = getUID();
  this.citizen = citizen;
  this.vehicle = vehicle;
  this.finalLocation = finalLocation;
  this.simulationId = simulationId;
  this.duration = null;
}

Ride.prototype.setDuration = function(duration) {
  this.duration = duration;
}

/** 
 * Takes a feature collection and based on the type it belongs adds properties to it and then adds it to the map as a layer
 * @param featureCollection - an object of type featureCollection that holds all features
 * @param type - string which could be of type 'vehicles', 'citizens', or 'places'
 */
Simulation.prototype.updateSimulationMarkersProperties = function(type, featureCollection) {
  turf.featureEach(featureCollection, (currentFeature) => {
    switch (type) {
    case 'vehicles':
      currentFeature.properties['marker-color'] = '#ffe100'
      currentFeature.properties['title'] = `Vehicle at [${currentFeature.geometry.coordinates[0]}, ${currentFeature.geometry.coordinates[1]}]`;
      currentFeature.properties['marker-size'] = 'small';
      currentFeature.properties['marker-symbol'] = 'car';
      this.vehicles.push(new Vehicle(currentFeature, 'idle', 0));
      currentFeature.properties['id'] = this.vehicles[this.vehicles.length - 1].id;

      break;
    case 'citizens':
      currentFeature.properties['marker-color'] = '#00ff11'
      currentFeature.properties['title'] = `Citizen at [${currentFeature.geometry.coordinates[0]}, ${currentFeature.geometry.coordinates[1]}]`;
      currentFeature.properties['marker-size'] = 'small';
      currentFeature.properties['marker-symbol'] = 'pitch';
      this.citizens.push(new Citizen(currentFeature, null, null))
      currentFeature.properties['id'] = this.citizens[this.citizens.length - 1].id;
      break;
    case 'places':
      currentFeature.properties['marker-color'] = '#ff0000'
      currentFeature.properties['title'] = `Place at [${currentFeature.geometry.coordinates[0]}, ${currentFeature.geometry.coordinates[1]}]`;
      currentFeature.properties['marker-size'] = 'small';
      this.places.push(new Place(currentFeature));
      currentFeature.properties['id'] = this.places[this.places.length - 1].id;
      break;
    default:
      break;
    }
  });

/* ---------------------------- call Map.setAndAddSimulationMarkerFeatureCollection(markerType, featureCollection) instead ----------------------- */
  this.map.setAndAddSimulationMarkerFeatureCollection(type, featureCollection); //layers.simulationMarkers.push(L.mapbox.featureLayer().setGeoJSON(featureCollection));
  //map.addLayer(layers.simulationMarkers[layers.simulationMarkers.length - 1]);
/* ---------------------------- ------------------------------------------------------- ----------------------- */
}

/**
 * Generates random markers scattered around the circle area 
 */
Simulation.prototype.generateMarkers = function(number, type) {
  /* call Map.getBufferedPoints() */
  let bufferedPoints = this.map.getBufferedPoints(),
    featureCollection = turf.random('point', number, {
      bbox: turf.bbox(bufferedPoints)  
    }),
    j = 0, // upper boundary to avoid endless loop
    insideCircle = turf.within(featureCollection, turf.featureCollection([bufferedPoints]));

  while (insideCircle.features.length < number && j < 50) {
    featureCollection = turf.random('point', number - insideCircle.features.length, {
      bbox: turf.bbox(bufferedPoints)  
    });

    insideCircle = turf.featureCollection([
      ...insideCircle.features, 
      ...turf.within(featureCollection, turf.featureCollection([bufferedPoints])).features
    ]);

    j = j + 1;
  }

  this.updateSimulationMarkersProperties(type, insideCircle);
}

/**
 * Simulates a ride
 * @param citizen - object containing the citizen that is moving
 * @param place - object containing  the destination of the citizen
 * @param iteration - number that holds the iteration number of the simulation
 * @param timeOfSimulationStart - number that hold the time in seconds of the simulation's start
 */
Simulation.prototype.simulateRide = function(citizen, place, iteration, numberOfSimulations, timeOfSimulationStart) {
  // update destination
  let timeOfRideStart = moment().seconds();
  const duration = new function() {
      this.timeFromInitialPositionToWaypoint = null;
      this.timeFromVehiclePositionToFinalPosition = null;
      this.multiLeg = true;
      this.getTotalDuration = (() => {
        return this.multiLeg ? this.timeFromVehiclePositionToFinalPosition + this.timeFromInitialPositionToWaypoint : this.timeFromInitialPositionToWaypoint;
      });
  };

  const apiCallOptions = function(endpoint, name) {
    return {
      endpoint: endpoint,
      name: name
    }
  };

  const coordinatesOfRoute = new function() {
    this.firstLeg = [];
    this.secondLeg = [];
    this.multiLeg = true;
    this.getAllCoordinates = (() => {
      // the last of the first leg and the first of the second leg are the same
      return this.multiLeg ? [ ...this.firstLeg.slice(0, this.firstLeg.length), ...this.secondLeg ] : this.firstLeg;
    });
  };

  const vehicleLocations = this.vehicles.filter(vehicle => vehicle.status === 'idle').map(vehicle => vehicle.location);


  if (vehicleLocations.length === 0 || citizen.destination !== null) {
    return false;
  }

  // find nearest vehicle
  const nearestVehicleFeature = turf.nearest(citizen.location, turf.featureCollection(vehicleLocations))
  const nearestVehicle = this.vehicles.filter(vehicle => vehicle.location === nearestVehicleFeature)[0];
  nearestVehicle.status = 'on-the-road';
  citizen.destination = _.cloneDeep(place.location);
  citizen.vehicle = _.cloneDeep(nearestVehicle);
  let ride = new Ride(this.id, _.cloneDeep(citizen), _.cloneDeep(nearestVehicle), _.cloneDeep(place))
  // road from his place to vehicle
  const citizenCoordinates = citizen.location.geometry.coordinates;
  const vehicleCoordinates = nearestVehicleFeature.geometry.coordinates;
  const placeCoordinates = place.location.geometry.coordinates;
  

  let startEnd = `${citizenCoordinates[0]},${citizenCoordinates[1]};${vehicleCoordinates[0]},${vehicleCoordinates[1]}`;
  let endpoint = `https://api.mapbox.com/directions/v5/mapbox/walking/${startEnd}.json?geometries=geojson&access_token=${L.mapbox.accessToken}`;
  const directionsFromCitizenToVehicle = apiCallOptions(endpoint, 'citizenToVehicle');
   
  startEnd = `${citizenCoordinates[0]},${citizenCoordinates[1]};${placeCoordinates[0]},${placeCoordinates[1]}`;
  endpoint = `https://api.mapbox.com/directions/v5/mapbox/walking/${startEnd}.json?geometries=geojson&access_token=${L.mapbox.accessToken}`;
  const directionsFromCitizenToPlace = apiCallOptions(endpoint, 'citizenToPlace');
  startEnd = `${vehicleCoordinates[0]},${vehicleCoordinates[1]};${placeCoordinates[0]},${placeCoordinates[1]}`;
  endpoint = `https://api.mapbox.com/directions/v5/mapbox/driving/${startEnd}.json?geometries=geojson&access_token=${L.mapbox.accessToken}`; 
  const directionsFromVehicleToPlace = apiCallOptions(endpoint, 'vehicleToPlace'); 

  Promise.map([directionsFromCitizenToVehicle, directionsFromCitizenToPlace, directionsFromVehicleToPlace], (apiCallOptions) => {
    return Promise.join(request.get(apiCallOptions.endpoint), (data) => {
      return {
        name: apiCallOptions.name,
        data: data.body
      };
    });
  })
  .then((routeInformation) => {
    return routeInformation.map((route) => {
      let coordinates = route.data.routes[0].geometry.coordinates;
      switch (route.name) {
      case 'vehicleToPlace':
        coordinates.push(placeCoordinates);
        coordinates.unshift(vehicleCoordinates);
        break;
      case 'citizenToVehicle': 
        coordinates.push(vehicleCoordinates);
        coordinates.unshift(citizenCoordinates);
        break;
      case 'citizenToPlace':
        coordinates.push(placeCoordinates);
        coordinates.unshift(citizenCoordinates);
        break;
      default:
        break;
      }

      return {
        name: route.name,
        coordinates: coordinates,
        duration: route.data.routes[0].duration
      };
    })
  })
  .then((routes) => {
    let routeDurationWithVehicleWaypoint = routes.filter(route => route.name === 'citizenToVehicle')[0].duration + routes.filter(route => route.name === 'vehicleToPlace')[0].duration;
    let routeDurationWithoutVehicle = routes.filter(route => route.name === 'citizenToPlace')[0].duration;
    routeDurationWithVehicleWaypoint >= routeDurationWithoutVehicle ? 
      _.remove(routes, (route) => { return route.name !== 'citizenToPlace' }) :
      _.remove(routes, (route) => { return route.name === 'citizenToPlace' });

    if (routes.length < 2) {
      duration.multiLeg = false;
      coordinatesOfRoute.multiLeg = false;
      duration.timeFromInitialPositionToWaypoint = routes[0].duration;
      coordinatesOfRoute.firstLeg = routes[0].coordinates;
    } else if (routes.length === 2) {
      duration.timeFromInitialPositionToWaypoint = routes[0].duration;
      duration.timeFromVehiclePositionToFinalPosition = routes[1].duration;
      coordinatesOfRoute.firstLeg = routes[0].coordinates;
      coordinatesOfRoute.secondLeg = routes[1].coordinates;
    }

    let relativeDurationToStartOfSimulation =  timeOfRideStart - timeOfSimulationStart + duration.getTotalDuration();

    if (relativeDurationToStartOfSimulation > this.totalSimulationDuration) {
      this.totalSimulationDuration = relativeDurationToStartOfSimulation;
      if (this.runningIntervalsAndTimeouts.simulationEnd !== null) {
        clearTimeout(this.runningIntervalsAndTimeouts.simulationEnd);
      }

      this.runningIntervalsAndTimeouts.simulationEnd = setTimeout(() => {            
        this.finalizeSimulation();
        console.log('>>>>>> SIMULATION ENDED');
      }, (duration.getTotalDuration() * 100) + 1000);
    }

    this.paths.push(turf.lineString(coordinatesOfRoute.getAllCoordinates(), {
      "name": `Iteration ${iteration} path`,
      "duration": duration.getTotalDuration(), 
      "stroke": pathColors[iteration % 10],
      "stroke-width": 4,
      "opacity": 1
    }));

    /* ------------------- call setAndAddSimulationPathFeatureCollection(markerTpe, id, newCoordinates) instead ---------------------- */
    // TODO: change iteration for a real ride ID
    this.map.setAndAddSimulationPathFeatureCollection(ride.id, turf.featureCollection([this.paths[this.paths.length - 1]]));
    /*layers.simulationPaths.push(L.mapbox.featureLayer().setGeoJSON()))

    let currentPathLayerIndex = layers.simulationPaths.length - 1;

    map.addLayer(layers.simulationPaths[currentPathLayerIndex]);*/
    /* ------------------- ---------------------- ---------------------- ---------------------- --------------------- */          

    let totalRideDurationParsed = moment.duration(duration.getTotalDuration(), 'seconds').humanize()
    let middlePointOfPath = [coordinatesOfRoute.getAllCoordinates()[ parseInt(coordinatesOfRoute.getAllCoordinates().length * 0.5)][1],
    coordinatesOfRoute.getAllCoordinates()[ parseInt(coordinatesOfRoute.getAllCoordinates().length * 0.5) ][0]]
    
    /* ------------------- call createAndAddSimulationRideDurationFeature(coordinates)^^ instead ---------------------- */
    this.map.createAndAddSimulationRideDurationFeature(ride.id, middlePointOfPath, totalRideDurationParsed);
    // layers.ridesDuration.push()
    /* ------------------- ---------------------- ---------------------- ---------------------- --------------------- */          

    let sublegsOfFirstLeg = 0;
    const citizenMovementToVehicleAnimation = setInterval(() => {
      sublegsOfFirstLeg = sublegsOfFirstLeg + 1;
      let pathToVehicle = turf.lineString(coordinatesOfRoute.firstLeg);
      let totalPathDistance = turf.lineDistance(pathToVehicle);
      let getNewPoint = turf.along(pathToVehicle, totalPathDistance / 100 * sublegsOfFirstLeg);
      /* ------------------- call updateMarkerCoordinates(markerTpe, id, newCoordinates) instead ---------------------- */
      this.map.updateMarkerCoordinates('citizens', citizen.id, getNewPoint.geometry.coordinates);
      /*let citizenMarkers = layers.simulationMarkers[1].getGeoJSON();
      citizenMarkers.features.filter(feature => feature.properties.id === citizen.id)[0].geometry.coordinates = getNewPoint.geometry.coordinates;
      layers.simulationMarkers[1].setGeoJSON(citizenMarkers).addTo(map);*/
      /* ------------------- ---------------------- ---------------------- ---------------------- --------------------- */
    }, (duration.timeFromInitialPositionToWaypoint * 100) / 100);

    let sublegsOfSecondLeg = 0;
    let citizenInVehicleToDestinationAnimation;
    if (coordinatesOfRoute.multiLeg) {
      let startOfCitizenInVehicleToDestinationAnimation = setTimeout(() => {
        clearInterval(citizenMovementToVehicleAnimation);
        citizenInVehicleToDestinationAnimation = setInterval(() => {
          sublegsOfSecondLeg = sublegsOfSecondLeg + 1;
          let pathToDestination = turf.lineString(coordinatesOfRoute.secondLeg);
          let totalPathDistance = turf.lineDistance(pathToDestination);
          let getNewPoint = turf.along(pathToDestination, totalPathDistance / 100 * sublegsOfSecondLeg);
          /* ------------------- call updateMarkerCoordinates(markerTpe, id, newCoordinates) instead ---------------------- */
          this.map.updateMarkerCoordinates('citizens', citizen.id, getNewPoint.geometry.coordinates);
          this.map.updateMarkerCoordinates('vehicles', nearestVehicle.id, getNewPoint.geometry.coordinates);
/*
          let citizenMarkers = layers.simulationMarkers[1].getGeoJSON();
          let vehicleMarkers = layers.simulationMarkers[0].getGeoJSON();
          citizenMarkers.features.filter(feature => feature.properties.id === citizen.id)[0].geometry.coordinates = getNewPoint.geometry.coordinates;
          vehicleMarkers.features.filter(feature => feature.properties.id === nearestVehicle.id)[0].geometry.coordinates = getNewPoint.geometry.coordinates;
          layers.simulationMarkers[0].setGeoJSON(vehicleMarkers).addTo(map);
          layers.simulationMarkers[1].setGeoJSON(citizenMarkers).addTo(map);*/
          /* ------------------- ---------------------- ---------------------- ---------------------- --------------------- */          
        }, (duration.timeFromVehiclePositionToFinalPosition * 100) / 100);
      }, duration.timeFromInitialPositionToWaypoint * 100);
      this.runningIntervalsAndTimeouts.rideAnimation.vehicleToDestination.push(citizenInVehicleToDestinationAnimation);
      this.runningIntervalsAndTimeouts.rideAnimation.secondAnimationStart.push(startOfCitizenInVehicleToDestinationAnimation);
    } else {
      this.runningIntervalsAndTimeouts.rideAnimation.citizenToWaypoint.push(citizenMovementToVehicleAnimation);
    }

    // const currentRideDurationIndex = layers.ridesDuration.length - 1;

    //this.map.addLayer(layers.ridesDuration[currentRideDurationIndex]);
    this.runningIntervalsAndTimeouts.rideEnd.push(setTimeout(() => {
      console.log('>>>>>>> RIDE CONCLUDED')
      console.log('======================')
      console.log('Citizen moved from ', citizen.location, ' to ', citizen.destination);
      console.log('Nearest vehicle founded at ', nearestVehicle.location);
      console.log('======================')
      ride.setDuration(_.cloneDeep(duration))
      this.rides.push(ride);
      citizen.destination = null;
      citizen.location = place.location;
      nearestVehicle.location = place.location;
      nearestVehicle.status = 'idle';
      !(coordinatesOfRoute.multiLeg) ? clearInterval(citizenMovementToVehicleAnimation) : clearInterval(citizenInVehicleToDestinationAnimation);
      
      this.map.updateMarkerCoordinates('vehicles', nearestVehicle.id, nearestVehicle.location.geometry.coordinates);

      /*let vehicleMarkers = layers.simulationMarkers[0].getGeoJSON();
      vehicleMarkers.features.filter(feature => feature.properties.id === nearestVehicle.id)[0].geometry.coordinates = nearestVehicle.location.geometry.coordinates;
      layers.simulationMarkers[0].setGeoJSON(vehicleMarkers).addTo(map);
      let citizenMarkers = layers.simulationMarkers[1].getGeoJSON();*/
      this.map.updateMarkerCoordinates('citizens', citizen.id, citizen.location.geometry.coordinates);      
     /* citizenMarkers.features.filter(feature => feature.properties.id === citizen.id)[0].geometry.coordinates = citizen.location.geometry.coordinates;
      layers.simulationMarkers[1].setGeoJSON(citizenMarkers).addTo(map);*/
      this.map.removeSimulationRideLayers(ride.id);
      /*map.removeLayer(layers.ridesDuration[currentRideDurationIndex]);
      layers.simulationPaths[currentPathLayerIndex].clearLayers();*/
    }, duration.getTotalDuration() * 100)); // to speed up everything it's using seconds as milliseconds
  });

  return true;
}

/**
 * Starts the simulation
 * @todo take the id and load the simulation based on the id
 */
Simulation.prototype.startSimulation = function(id) {
  console.log('>>>>> SIMULATION STARTS');
  let _this = this;
  let getRandomPlaceIndex = function () {
    return Math.floor(Math.random() * (_this.places.length));
  };

  let numberOfSimulations = Math.floor(Math.random() * (7200 - 3600)) + 3600;
  let timeOfSimulationStart = moment().seconds();
  /*this.currentSimulation.citizens = citizens;
  this.currentSimulation.places = places;
  this.currentSimulation.vehicles = vehicles;*/
  for (var i = 0; i < numberOfSimulations; i++) {
    citizenIndex = i % this.citizens.length;
    
    setTimeout((citizen, place, iteration) => {
      this.simulateRide(citizen, place, iteration, numberOfSimulations, timeOfSimulationStart);
    }, Math.floor(Math.random() * (this.getMaxTime() - this.getMinTime())) + this.getMinTime(), this.citizens[citizenIndex], this.places[getRandomPlaceIndex()], i);
  }
}

/**
 * Runs a simulation
 */
Simulation.prototype.run = function() {
  this.resetMap();
  this.prepareSimulation();
  this.startSimulation();
}

/**
 * Clears all layers but the tile layer, circle polygon and the central marker layer of the existing map and sets all simulation arrays to 0
 */
Simulation.prototype.resetMap = function() {
  /* -------call Map.clearSimulationLayers() instead ----------- */
  this.map.clearSimulationLayers();
  /*layers.simulationMarkers.forEach((layer) => {
    layer.clearLayers();
  });

  layers.simulationPaths.forEach((layer) => {
    layer.clearLayers();
  });

  layers.ridesDuration.forEach((layer) => {
    map.removeLayer(layer);
  });*/
  /* ------------------------ --------------------------------- */

  this.clearAllIntervalsAndTimeouts();
  this.currentSimulation = null;
  this.onSimulation = false;
  
  this.vehicles.length = 0;
  this.places.length = 0;
  this.citizens.length = 0;
  this.paths.length = 0;
  this.rides.length = 0;
  /* -------call Map.clearSimulationLayers() instead ----------- */
  /*layers.simulationPaths.length = 0;
  layers.simulationMarkers.length = 0;
  layers.ridesDuration.length = 0;*/
  /* ------------------------ --------------------------------- */

  this.paths.length = 0;
}

/**
 * Prepares the markers of the simulation
 * TODO: If a simulation has been selected, load it from localStorage
 */
Simulation.prototype.prepareSimulation = function() {
  numberOfVehicles = prompt('Please enter the number of vehicles', '30');
  numberOfCitizens = prompt('Please enter the number of citizens', '10');
  this.generateMarkers(numberOfVehicles, 'vehicles');
  this.generateMarkers(numberOfCitizens, 'citizens');
  this.generateMarkers(Math.ceil(Math.random() * (100 - 50)) + 50, 'places');
  onSimulation = true;
}

/**
 * Clears all the timeouts of a simulation
 */
Simulation.prototype.clearAllIntervalsAndTimeouts = function() {
  let runningIntervalsAndTimeouts = this.runningIntervalsAndTimeouts;
  if (runningIntervalsAndTimeouts.rideEnd.length === 0) {
    return;
  }

  if (runningIntervalsAndTimeouts.simulationEnd !== null) {
    clearTimeout(runningIntervalsAndTimeouts.simulationEnd)
    runningIntervalsAndTimeouts.simulationEnd = null;
  }

  runningIntervalsAndTimeouts.rideAnimation.citizenToWaypoint.map(intervalId => clearInterval(intervalId));
  runningIntervalsAndTimeouts.rideAnimation.vehicleToDestination.map(intervalId => clearInterval(intervalId));
  runningIntervalsAndTimeouts.rideAnimation.secondAnimationStart.map(timeoutId => clearInterval(timeoutId));
  runningIntervalsAndTimeouts.rideEnd.map(timeout => clearTimeout(timeout));
  console.log('>>>> All timeouts have been cleared');
  runningIntervalsAndTimeouts.rideAnimation.citizenToWaypoint.length = 0;
  runningIntervalsAndTimeouts.rideAnimation.vehicleToDestination.length = 0;
  runningIntervalsAndTimeouts.rideAnimation.secondAnimationStart.length = 0;
  runningIntervalsAndTimeouts.rideEnd.length = 0;
}

/**
 * Takes a string and returns a number simulating the max numbers of seconds that can go by without a citizen using a vehicle
 * @param timeOfDay - string with values of either 'morning', 'afternoon', or 'evening'
 * @return number - max numbers of seconds that can go by without a citizen using a vehicle
 */
Simulation.prototype.getMaxTime = function(timeOfDay) {
  switch(timeOfDay) {
  case 'morning':
    return 10;
  case 'afternoon':
    return 100;
  case 'evening':
    return 1000;
  default: 
    return 500;
  }
}

/**
 * Takes a string and returns a number simulating the min numbers of seconds that can go by without a citizen using a vehicle
 * @param timeOfDay - string with values of either 'morning', 'afternoon', or 'evening'
 * @return number - min numbers of seconds that can go by without a citizen using a vehicle
 */
Simulation.prototype.getMinTime = function(timeOfDay) {
  switch(timeOfDay) {
  case 'morning':
    return 5;
  case 'afternoon':
    return 50;
  case 'evening':
    return 500;
  default: 
    return 250;
  }
}

/**
 * Finalizes a simulation by storing the simulation on localStorage and setting the flag of onSimulation to false
 */
Simulation.prototype.finalizeSimulation = function() {
  onSimulation = false;
  currentSimulation.rides = rides;
  let newSimulationKey = `simulation#${currentSimulation.id}#${moment().toISOString()}`;
  window.localStorage.setItem(newSimulationKey, JSON.stringify(currentSimulation, null, 4));
  let newSimulation = $('<option></option>').attr('value', localStorage.length).text(moment(newSimulationKey.split('#').reverse()[0]).fromNow());
  $('#history').prepend(newSimulation);
  simulationHistory.unshift(currentSimulation);
}