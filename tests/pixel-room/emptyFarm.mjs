export const emptyFarm = () => ({ serverNow:new Date().toISOString(), today:'2026-09-18', harvestCount:0, plots:[0,1].map(index=>({index,revision:0,crop:null})) });
