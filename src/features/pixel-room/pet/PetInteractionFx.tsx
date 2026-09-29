import type { InteractionStage } from './petInteraction';
import type { PetId } from './petKinds';
import './interaction.css';

// Tiny props drawn on the same 32px-per-cell pixel grid as the sprites (1 unit = 1 sprite pixel).
function HoneyPot() {
  return <svg viewBox="0 0 8 8" shapeRendering="crispEdges">
    <path d="M2 0h4v1H2z" fill="#7a4a22" /><path d="M1 1h6v1H1z" fill="#b86b2d" />
    <path d="M1 2h6v1h1v3H7v1H1V6H0V3h1z" fill="#e59a2f" /><path d="M2 7h4v1H2z" fill="#a85f25" />
    <path d="M3 3h2v2H3z" fill="#fff1c1" /><path d="M2 2h1v1H2z" fill="#ffd87a" /><path d="M5 1h1v2H5z" fill="#ffd23f" />
  </svg>;
}
function Bone() {
  return <svg viewBox="0 0 8 4" shapeRendering="crispEdges">
    <path d="M0 0h2v1h4V0h2v4H6V3H2v1H0z" fill="#fbf1dc" /><path d="M0 3h2v1H0zM6 3h2v1H6zM2 2h4v1H2z" fill="#d9c49c" />
  </svg>;
}
function Crumbs() {
  return <svg viewBox="0 0 10 4" shapeRendering="crispEdges">
    <path d="M0 2h2v2H0zM4 1h2v2H4zM8 2h2v2H8z" fill="#e2a75a" /><path d="M1 2h1v1H1zM5 1h1v1H5zM9 2h1v1H9z" fill="#f7d596" />
  </svg>;
}
function Seeds() {
  return <svg viewBox="0 0 10 4" shapeRendering="crispEdges">
    <path d="M0 3h1v1H0zM3 1h1v1H3zM5 3h1v1H5zM7 2h1v1H7zM9 3h1v1H9z" fill="#b8893f" /><path d="M2 3h1v1H2zM6 1h1v1H6z" fill="#e9c77d" />
  </svg>;
}
function Heart() {
  return <svg viewBox="0 0 7 6" shapeRendering="crispEdges">
    <path d="M1 0h2v1h1V0h2v1h1v2H6v1H5v1H4v1H3V5H2V4H1V3H0V1h1z" fill="#ff6b8a" /><path d="M1 1h1v1H1z" fill="#ffd1dc" />
  </svg>;
}

/** Treat, heart and speech overlays for one interaction beat; they sit inside the pet box and face the player. */
export function PetInteractionFx({ pet, stage, heart, right }: { pet: PetId; stage: InteractionStage; heart: boolean; right: boolean }) {
  const side = right ? 'right' : 'left';
  const grain = pet === 'pet_duck' || pet === 'pet_pigeon';
  return <>
    {!grain && stage === 'treat' && <span className={`pr-pet-treat pr-pet-treat-fly pr-pet-treat-${pet}`} data-side={side}>{pet === 'pet_bear' ? <HoneyPot /> : <Bone />}</span>}
    {grain && (stage === 'treat' || stage === 'peck') && <span className={`pr-pet-treat pr-pet-treat-grain pr-pet-treat-${pet}`} data-side={side} data-stage={stage}>{pet === 'pet_duck' ? <Crumbs /> : <Seeds />}</span>}
    {pet === 'pet_bear' && stage === 'eat' && <span className="pr-pet-say">냠냠</span>}
    {heart && <span className={`pr-pet-heart pr-pet-heart-${pet}`}><Heart /></span>}
  </>;
}
