#!/bin/bash

HOME=$(git rev-parse --show-toplevel)

if [[ -z $(which node) ]]; then
  echo 'Please install node before proceeding' 2> stdout
  exit 1
fi

mkdir -p ${HOME}/static

echo 'Creating JSON files..' 2> stdout
if [[ -f ${HOME}/scripts/createLineStringsOfBerlinMetro.js && -f ${HOME}/berlinData/shapes.txt ]]; then
  echo 'Creating LineStrings representing the metro lines of Berlin'
  node --max-old-space-size=4096 ${HOME}/scripts/createLineStringsOfBerlinMetro.js ${HOME}/berlinData/shapes.txt > ${HOME}/static/berlin-ubahn.json
else 
  echo 'Please check the line strings script and its corresponding open data file, one of them was not found' 2> stdout
  exit 1
fi

if [[ -f ${HOME}/scripts/createPointsOfBerlinMetroStations.js && -f ${HOME}/berlinData/stops.txt ]]; then
  echo 'Creating Points representing metro stations of Berlin'
  node --max-old-space-size=4096 ${HOME}/scripts/createPointsOfBerlinMetroStations.js ${HOME}/berlinData/stops.txt > ${HOME}/static/berlin-stations.json
else
  echo 'Please check the stations script and its corresponding open data file, one of them was not found' 2> stdout
  exit 1
fi
echo 'DONE!' 2> stdout
exit 0