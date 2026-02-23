"use server";

export async function getPlaceSuggestions(input: string) {
  // ✅ 로컬과 Vercel 모두 호환되도록 두 키를 다 찾습니다.
  const apiKey = process.env.GOOGLE_MAPS_SERVER_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  
  if (!apiKey) {
     console.error("❌ API 키가 없습니다!");
     return [];
  }

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
    } else {
       // 구글이 거절했을 경우 Vercel 로그에 이유를 남깁니다.
       console.error("❌ Google API Error (Suggestions):", data.error_message || data.status);
    }
    return []; 
  } catch (error) {
    console.error("❌ Google Maps Fetch Error:", error);
    return [];
  }
}

export async function getPlaceDetails(placeId: string) {
  const apiKey = process.env.GOOGLE_MAPS_SERVER_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) return null;

  try {
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
        if (c.types.includes("administrative_area_level_1")) state = c.short_name;
        if (c.types.includes("postal_code")) postcode = c.long_name;
      });

      return {
        address: `${street_number} ${route}`.trim(),
        suburb,
        state,
        postcode,
        lat: geometry?.location?.lat || null,
        lng: geometry?.location?.lng || null,
      };
    } else {
       console.error("❌ Google API Error (Details):", data.error_message || data.status);
    }
    return null;
  } catch (error) {
    console.error("❌ Google Maps Details Error:", error);
    return null;
  }
}