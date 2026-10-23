// MIO recovery prototype v0.1. Offline only; no production connections.
// Each committed event is immutable and has a monotonically increasing sequence.
import {createHash} from 'node:crypto';
export const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function checkpoint(state, sequence=0) {
  if (!Number.isSafeInteger(sequence)||sequence<0) throw Error('invalid sequence');
  return {sequence, state:structuredClone(state), hash:digest(state)};
}
export function replay(base, events) {
  if (!base || digest(base.state)!==base.hash) throw Error('checkpoint corrupted');
  const state=structuredClone(base.state);
  let sequence=base.sequence;
  for(const event of events) {
    if (!Number.isSafeInteger(event.sequence)||event.sequence!==sequence+1) throw Error('missing or reordered event');
    if (!event.id || typeof event.id!=='string') throw Error('missing event id');
    if (!['put','delete'].includes(event.operation)) throw Error('invalid operation');
    if (!['participants','attendance','fa','predictions','gachaGrants','gachaDraws'].includes(event.collection)) throw Error('invalid collection');
    if (typeof event.recordId!=='string'||!event.recordId) throw Error('invalid record id');
    if (event.operation==='put') {
      if (!event.record || typeof event.record!=='object'||Array.isArray(event.record)) throw Error('invalid record');
      state[event.collection]??={};
      state[event.collection][event.recordId]=structuredClone(event.record);
    } else {
      // A deletion is never silently replayed: it needs a separately reviewed restore plan.
      throw Error('deletion requires operator review');
    }
    sequence=event.sequence;
  }
  return checkpoint(state,sequence);
}
