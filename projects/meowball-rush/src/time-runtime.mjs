// Keep clock arithmetic outside the DOM so a hazard, fall, and the frame timer
// all have identical timeout semantics in the browser and deterministic checks.
export function applyTimePenalty(state,seconds,reason='hazard') {
  if(!Number.isFinite(seconds)||seconds<0)throw new RangeError('Time penalty must be a finite nonnegative number');
  const before=Math.max(0,Number.isFinite(state.timeLeft)?state.timeLeft:0);
  if(state.phase!==undefined&&state.phase!=='playing')return {seconds:0,reason,timeLeft:before,timedOut:false,applied:false};
  state.timeLeft=Math.max(0,before-seconds);
  state.timePenaltyTotal=(state.timePenaltyTotal||0)+seconds;
  const receipt={seconds,reason,timeLeft:state.timeLeft,timedOut:state.timeLeft===0,applied:true};
  state.lastTimePenalty=receipt;
  return receipt;
}
