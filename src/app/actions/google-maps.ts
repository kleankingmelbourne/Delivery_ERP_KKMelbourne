"use server";

export async function getPlaceSuggestions(input: string) {
  const apiKey = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!apiKey) return [];

  try {
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(
        input
      )}&components=country:au&key=${apiKey}`
    );
    const data = await response.json();

    if (data.status === "OK") {
      return data.predictions.map((p: any) => ({
        place_id: p.place_id,
        description: p.description,
      }));
    }
    return [];
  } catch (error) {
    console.error("Google Maps API Error:", error);
    return [];
  }
}

export async function getPlaceDetails(placeId: string) {
  const apiKey = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!apiKey) return null;

  try {
    // fields에 geometry를 반드시 포함해야 좌표(lat, lng)를 받아옵니다.
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=address_component,geometry&key=${apiKey}`
    );
    const data = await response.json();

    if (data.status === "OK" && data.result) {
      const components = data.result.address_components;
      const geometry = data.result.geometry;

      let street_number = "";
      let route = "";
      let suburb = "";
      let state = "";
      let postcode = "";

      components.forEach((c: any) => {
        if (c.types.includes("street_number")) street_number = c.long_name;
        if (c.types.includes("route")) route = c.long_name;
        if (c.types.includes("locality")) suburb = c.long_name;
        if (c.types.includes("administrative_area_level_1"))
          state = c.short_name;
        if (c.types.includes("postal_code")) postcode = c.long_name;
      });

      return {
        address: `${street_number} ${route}`.trim(),
        suburb,
        state,
        postcode,
        // ✅ 여기에 lat, lng를 추가해서 반환합니다.
        lat: geometry?.location?.lat || null,
        lng: geometry?.location?.lng || null,
      };
    }
    return null;
  } catch (error) {
    console.error("Google Maps Details Error:", error);
    return null;
  }
}