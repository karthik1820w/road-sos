#!/bin/bash
# Download and prepare India OSM extract for OSRM
set -e

mkdir -p osrm-data
cd osrm-data

echo "Downloading India OSM extract..."
wget -c https://download.geofabrik.de/asia/india-latest.osm.pbf

echo "Extracting with car profile..."
docker run -t -v $(pwd):/data osrm/osrm-backend osrm-extract -p /opt/car.lua /data/india-latest.osm.pbf

echo "Partitioning..."
docker run -t -v $(pwd):/data osrm/osrm-backend osrm-partition /data/india-latest.osrm

echo "Customizing..."
docker run -t -v $(pwd):/data osrm/osrm-backend osrm-customize /data/india-latest.osrm

echo "Done! Run 'docker compose up -d osrm' to start the OSRM server."
