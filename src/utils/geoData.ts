export interface DataCenterInfo {
  city: string;
  asn: string;
  latNum: number;
  lonNum: number;
  latStr: string;
  lonStr: string;
}

export const DATA_CENTERS: DataCenterInfo[] = [
  { city: 'SAN FRANCISCO, US', asn: 'AS13335 CLOUDFLARE', latNum: 37.7749, lonNum: -122.4194, latStr: '37.77° N', lonStr: '122.42° W' },
  { city: 'ASHBURN, US-EAST', asn: 'AS16509 AMAZON-02', latNum: 39.0438, lonNum: -77.4874, latStr: '39.04° N', lonStr: '77.49° W' },
  { city: 'FRANKFURT, DE', asn: 'AS24940 HETZNER-AS', latNum: 50.1109, lonNum: 8.6821, latStr: '50.11° N', lonStr: '8.68° E' },
  { city: 'LONDON, UK', asn: 'AS15169 GOOGLE', latNum: 51.5074, lonNum: -0.1278, latStr: '51.51° N', lonStr: '0.13° W' },
  { city: 'SINGAPORE, SG', asn: 'AS45102 ALIBABA', latNum: 1.3521, lonNum: 103.8198, latStr: '1.35° N', lonStr: '103.82° E' },
  { city: 'TOKYO, JP', asn: 'AS2516 KDDI', latNum: 35.6762, lonNum: 139.6503, latStr: '35.68° N', lonStr: '139.65° E' },
];

export function getTargetDataCenter(url?: string): DataCenterInfo {
  if (!url) return DATA_CENTERS[0];
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    hash = (hash * 31 + url.charCodeAt(i)) | 0;
  }
  return DATA_CENTERS[Math.abs(hash) % DATA_CENTERS.length];
}
