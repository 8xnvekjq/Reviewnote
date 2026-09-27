import { Bear, BearSprite } from './Bear';
import { Dog, DogSprite } from './Dog';
import { Duck, DuckSprite } from './Duck';
import type { DogWorld } from './dogModel';
import type { PetId } from './petKinds';
export function Companion({ pet, world, paused }: { pet: PetId; world: DogWorld; paused?: boolean }) {
  return pet === 'pet_bear' ? <Bear world={world} paused={paused} /> : pet === 'pet_duck' ? <Duck world={world} paused={paused} /> : <Dog world={world} paused={paused} />;
}
export function PetPreview({ pet }: { pet: string }) { return pet === 'pet_bear' ? <BearSprite /> : pet === 'pet_duck' ? <DuckSprite /> : pet === 'pet_dog' ? <DogSprite /> : null; }
