#!/usr/bin/env node

const fs = require('fs'),
    turf = require('turf'),
    _ = require('lodash'),
    dataFileName = process.argv[2];

let fileInLines = [];
let metroLinesAsLineString = [];
fileInLines = fs.readFileSync(dataFileName).toString().split(/,?\s?\n/).filter(v => v.length);
fileInLines = _.drop(fileInLines.map(line => line.split(',')));
groupedLines = _.groupBy(fileInLines, (line) => { return line[0]; });

Object.keys(groupedLines).slice(0, 5000).map(key => groupedLines[key]).forEach(metroLine => {
  let featurePoints = metroLine.map(metroLinePoints => {
    return turf.point([metroLinePoints[2], metroLinePoints[1]])
  })
  .map(metroLinePoints => metroLinePoints.geometry.coordinates);
  let lineString = turf.lineString(featurePoints, {
      stroke: 'purple',
      "stroke-width": 3,
      opacity: 1,
      zIndexOffset: 999
    });

  metroLinesAsLineString.push(lineString);
});

console.log(`${JSON.stringify(metroLinesAsLineString, null, 4)}`);
