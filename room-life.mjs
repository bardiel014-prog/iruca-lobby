export const ROOM_TTL=24*60*60*1000;
export const roomExpiry=r=>(r.lastPlayedAt??r.createdAt??r.updated)+ROOM_TTL;
export const roomExpired=(r,now=Date.now())=>now>=roomExpiry(r);
