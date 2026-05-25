export interface Facility {
  name: string;
  type: string;
  lat: number;
  lng: number;
  dispatch_number: string;
  address?: string;
}

const GEO_API_KEY = (import.meta as any).env?.VITE_GEOAPIFY_API_KEY || 'your_geoapify_api_key';

export const geoapifyService = {
  async findNearbyEmergencyFacilities(lat: number, lng: number): Promise<Facility[]> {
    try {
      const url = `https://api.geoapify.com/v2/places?categories=healthcare.hospital,service.police,healthcare.ambulance_station,service.vehicle.towing,service.fire_station&filter=circle:${lng},${lat},5000&limit=8&apiKey=${GEO_API_KEY}`;
      const response = await fetch(url);
      const data = await response.json();

      if (!data || !data.features) {
        console.warn("Geoapify: No features returned or API error:", data);
        return [];
      }

      return data.features.map((f: any) => {
        const categories = f.properties.categories || [];
        let type = 'GENERAL';
        let dispatch = '112';

        if (categories.includes('healthcare.hospital')) {
          type = 'TRAUMA CENTER';
          dispatch = '112-MED';
        } else if (categories.includes('service.police')) {
          type = 'POLICE';
          dispatch = '100';
        } else if (categories.includes('healthcare.ambulance_station')) {
          type = 'AMBULANCE';
          dispatch = '108';
        } else if (categories.includes('service.vehicle.towing')) {
          type = 'VEHICLE RESCUE';
          dispatch = 'SOS-TOW';
        } else if (categories.includes('service.fire_station')) {
          type = 'FIRE & RESCUE';
          dispatch = '101';
        }

        return {
          name: f.properties.name || `${type} Station`,
          type,
          lat: f.properties.lat,
          lng: f.properties.lon,
          dispatch_number: f.properties.contact?.phone || dispatch,
          address: f.properties.formatted
        };
      });
    } catch (err) {
      console.error("Geoapify Error:", err);
      return [];
    }
  },

  async reverseGeocode(lat: number, lng: number): Promise<string> {
    try {
      const url = `https://api.geoapify.com/v1/geocode/reverse?lat=${lat}&lon=${lng}&apiKey=${GEO_API_KEY}`;
      const response = await fetch(url);
      const data = await response.json();
      return data.features[0]?.properties.formatted || "Unknown Location";
    } catch {
      return "Unknown Location";
    }
  }
};
