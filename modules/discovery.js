const STATE_BOXES = `AL 30.2 35.0 -88.5 -84.9|AK 51.2 71.4 -179.1 -129.9|AZ 31.3 37.0 -114.8 -109.0|AR 33.0 36.5 -94.6 -89.6|CA 32.5 42.0 -124.4 -114.1|CO 37.0 41.0 -109.1 -102.0|CT 40.9 42.1 -73.7 -71.8|DE 38.4 39.8 -75.8 -75.0|DC 38.8 39.0 -77.1 -76.9|FL 24.5 31.0 -87.6 -80.0|GA 30.4 35.0 -85.6 -80.8|HI 18.9 22.2 -160.2 -154.8|ID 42.0 49.0 -117.2 -111.0|IL 36.9 42.5 -91.5 -87.5|IN 37.8 41.8 -88.1 -84.8|IA 40.4 43.5 -96.6 -90.1|KS 37.0 40.0 -102.1 -94.6|KY 36.5 39.1 -89.6 -81.9|LA 28.9 33.0 -94.0 -88.8|ME 43.1 47.5 -71.1 -66.9|MD 37.9 39.7 -79.5 -75.0|MA 41.2 42.9 -73.5 -69.9|MI 41.7 48.3 -90.4 -82.4|MN 43.5 49.4 -97.2 -89.5|MS 30.2 35.0 -91.7 -88.1|MO 36.0 40.6 -95.8 -89.1|MT 44.4 49.0 -116.1 -104.0|NE 40.0 43.0 -104.1 -95.3|NV 35.0 42.0 -120.0 -114.0|NH 42.7 45.3 -72.6 -70.7|NJ 38.9 41.4 -75.6 -73.9|NM 31.3 37.0 -109.1 -103.0|NY 40.5 45.0 -79.8 -71.9|NC 33.8 36.6 -84.3 -75.5|ND 45.9 49.0 -104.1 -96.6|OH 38.4 42.0 -84.8 -80.5|OK 33.6 37.0 -103.0 -94.4|OR 42.0 46.3 -124.6 -116.5|PA 39.7 42.3 -80.5 -74.7|RI 41.1 42.0 -71.9 -71.1|SC 32.0 35.2 -83.4 -78.5|SD 42.5 45.9 -104.1 -96.4|TN 35.0 36.7 -90.3 -81.6|TX 25.8 36.5 -106.6 -93.5|UT 37.0 42.0 -114.1 -109.0|VT 42.7 45.0 -73.4 -71.5|VA 36.5 39.5 -83.7 -75.2|WA 45.5 49.0 -124.8 -116.9|WV 37.2 40.6 -82.6 -77.7|WI 42.5 47.1 -92.9 -86.8|WY 41.0 45.0 -111.1 -104.1`
  .split("|").map((row) => {
    const [code,minLat,maxLat,minLng,maxLng]=row.split(" ");
    return {code,minLat:+minLat,maxLat:+maxLat,minLng:+minLng,maxLng:+maxLng};
  });

const STATE_NAMES={
  alabama:"AL",alaska:"AK",arizona:"AZ",arkansas:"AR",california:"CA",colorado:"CO",connecticut:"CT",
  delaware:"DE","district of columbia":"DC",florida:"FL",georgia:"GA",hawaii:"HI",idaho:"ID",illinois:"IL",
  indiana:"IN",iowa:"IA",kansas:"KS",kentucky:"KY",louisiana:"LA",maine:"ME",maryland:"MD",
  massachusetts:"MA",michigan:"MI",minnesota:"MN",mississippi:"MS",missouri:"MO",montana:"MT",
  nebraska:"NE",nevada:"NV","new hampshire":"NH","new jersey":"NJ","new mexico":"NM","new york":"NY",
  "north carolina":"NC","north dakota":"ND",ohio:"OH",oklahoma:"OK",oregon:"OR",pennsylvania:"PA",
  "rhode island":"RI","south carolina":"SC","south dakota":"SD",tennessee:"TN",texas:"TX",utah:"UT",
  vermont:"VT",virginia:"VA",washington:"WA","west virginia":"WV",wisconsin:"WI",wyoming:"WY",
};
const STATE_CODES=new Set(STATE_BOXES.map((box)=>box.code));

export const stateFromCoords=(latitude,longitude)=>{
  const inside=STATE_BOXES.filter((box)=>
    latitude>=box.minLat && latitude<=box.maxLat && longitude>=box.minLng && longitude<=box.maxLng);
  if(inside.length===1) return inside[0].code;
  const candidates=inside.length ? inside : STATE_BOXES;
  let best=null;
  let bestDistance=Infinity;
  for(const box of candidates){
    const dLat=latitude-(box.minLat+box.maxLat)/2;
    const dLng=(longitude-(box.minLng+box.maxLng)/2)*Math.cos(latitude*Math.PI/180);
    const distance=dLat*dLat+dLng*dLng;
    if(distance<bestDistance){bestDistance=distance;best=box.code;}
  }
  return best;
};

export const parseRegion=(value)=>{
  const parts=String(value || "").split(",").map((part)=>part.trim()).filter(Boolean);
  if(!parts.length) return {city:"",state:""};
  let state="";
  let cityIndex=parts.length-1;
  for(let index=parts.length-1;index>=0;index-=1){
    const token=parts[index].replace(/\s+\d{5}(-\d{4})?$/,"").trim();
    const upper=token.toUpperCase();
    if(STATE_CODES.has(upper)){state=upper;cityIndex=index-1;break;}
    if(STATE_NAMES[token.toLowerCase()]){state=STATE_NAMES[token.toLowerCase()];cityIndex=index-1;break;}
  }
  return {city:(parts[cityIndex] || "").toLowerCase(),state};
};

export const regionLabel=(region)=>
  [region.city ? region.city.replace(/\b\w/g,(character)=>character.toUpperCase()) : "",region.state]
    .filter(Boolean).join(", ");

export const proximityRank=(event,region)=>{
  if(!region || !region.state) return 2;
  const eventRegion=parseRegion(event.location_name);
  if(!eventRegion.state || eventRegion.state!==region.state) return 2;
  return region.city && eventRegion.city===region.city ? 0 : 1;
};

export function raceTypeFor(tiers=[]){
  const distances=tiers.map((tier)=>String(tier.distance_label || "").toLowerCase()).join(" ");
  if(distances.includes("marathon") || distances.includes("26.2")) return {label:"26.2",kind:"marathon"};
  if(distances.includes("trail") || distances.includes("ultra")) return {label:"TR",kind:"trail"};
  if(distances.includes("10k") || distances.includes("6.2")) return {label:"10K",kind:"road"};
  if(distances.includes("5k") || distances.includes("3.1")) return {label:"5K",kind:"road"};
  return {label:"RUN",kind:"open"};
}
