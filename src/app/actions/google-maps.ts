"use server"

const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

export async function getPlaceSuggestions(input: string) {
  if (!input || input.length < 3) return [];

  try {
    // Google Places Autocomplete API (REST)
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(input)}&components=country:au&types=address&key=${GOOGLE_MAPS_API_KEY}`,
      { cache: 'no-store' }
    );
    const data = await response.json();
    
    if (data.status === 'OK') {
      return data.predictions;
    } else {
      console.error("Google Maps Autocomplete Error:", data.status);
      return [];
    }
  } catch (error) {
    console.error("Failed to fetch suggestions:", error);
    return [];
  }
}

export async function getPlaceDetails(placeId: string) {
  try {
    // Google Places Details API (REST)
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=address_component&key=${GOOGLE_MAPS_API_KEY}`,
      { cache: 'no-store' }
    );
    const data = await response.json();

    if (data.status === 'OK') {
      const components = data.result.address_components;
      let streetNum = "";
      let route = "";
      let suburb = "";
      let state = "";
      let postcode = "";

      // 주소 컴포넌트 파싱
      components.forEach((c: any) => {
        if (c.types.includes("street_number")) streetNum = c.long_name;
        if (c.types.includes("route")) route = c.long_name;
        if (c.types.includes("locality")) suburb = c.long_name;
        if (c.types.includes("administrative_area_level_1")) state = c.short_name;
        if (c.types.includes("postal_code")) postcode = c.long_name;
      });

      return {
        address: `${streetNum} ${route}`.trim(),
        suburb,
        state,
        postcode
      };
    }
    return null;
  } catch (error) {
    console.error("Failed to fetch place details:", error);
    return null;
  }
}