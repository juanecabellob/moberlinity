#!/usr/bin/env node

const fs = require('fs'),
    turf = require('turf'),
    _ = require('lodash'),
    dataFileName = process.argv[2];

let fileInLines = [];
let metroStationsAsFeaturePoints = [];
fileInLines = fs.readFileSync(dataFileName).toString().split(/\s?\n/).filter(v => v.length);
fileInLines = _.drop(fileInLines.map(line => line.split(/,(?!\s)/)));
fileInLines = fileInLines.filter(metroStation => metroStation[2].includes('U ') || metroStation[2].includes('S+U ') || metroStation[2].includes('S '));
fileInLines.forEach(metroStation => {
  metroStation[2] = metroStation[2].replace(/^"|"$/g, '');
  let featurePoints = turf.point([parseFloat(metroStation[5].replace(/^"|"$/g, '')), parseFloat(metroStation[4].replace(/^"|"$/g, ''))], {
    title: metroStation[2],
    'marker-size': 'small',
    'marker-symbol': 'rail-metro',
    zIndexOffset: 999
  });
  
  metroStationsAsFeaturePoints.push(featurePoints);

});

console.log(`${JSON.stringify(metroStationsAsFeaturePoints, null, 4)}`);
