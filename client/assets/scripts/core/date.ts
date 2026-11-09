import { VEHICLES } from './vehicles';
export function shanghaiDate(time: Date = new Date()): string {
 const parts = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(time);
 const get = (type: string) => parts.find(part => part.type === type)?.value;
 return `${get('year')}-${get('month')}-${get('day')}`;
}
export function vehicleForDate(date: string) {
 if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('invalid date');
 const time = Date.parse(date+'T00:00:00Z');
 if (!Number.isFinite(time) || new Date(time).toISOString().slice(0,10) !== date) throw new Error('invalid date');
 const days = (time - Date.UTC(2027,0,1))/86400000;
 return VEHICLES[((days % 6)+6)%6];
}
