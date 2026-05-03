# Hex Medieval - Design Document

## Artistic Vision
Hex Medieval is a turn-based tactics game designed with a "Retro-Brutalist" aesthetic. It combines the tactile feel of classic tabletop war games with high-contrast, modern UI elements.

## Graphics & Visuals
- **Minimalist 3D & Procedural Elements**: Low-poly units and terrain with clean, hand-painted style textures. The game utilizes a **Custom Procedural Water System** powered by hand-written GLSL shaders, featuring vertex wave displacement and animated white-flecked foam textures.
- **Instanced Rendering Pipeline**: To maintain 60 FPS on large maps, the engine uses an instanced geometry pipeline for water, trees, and base hexes, significantly reducing draw calls.
- **Retro-Brutalist Color Palette**: Each kingdom is represented by a high-saturation primary color with bold black outlines, creating a distinctive "comic-book tabletop" aesthetic.

## UI/UX Philosophy
- **Compact & Retro**: Menus strive for high information density with minimal wasted space. 
- **Physicality**: Buttons and panels use "Neo-Brutalist" shadows (hard black offsets) to look like real, physical objects on a drafting table.
- **Non-Aggressive Typography**: Avoids excessive capitalization to maintain a clean, readable, and professional appearance. Minimum font size is 1em (16px) across all UI elements to ensure high legibility on all devices.
- **Fluid Layouts**: The UI adapts dynamically to device orientation, moving to the top-right in landscape mode to maximize horizontal visibility of the battlefield.

## Audio Approach
- **Procedural Medieval Composition**: A custom real-time music engine generates unique medieval arrangements for every session. It blends a repository of historical melodies (e.g., *Palästinalied*) with procedural solos, shifting through various medieval modes (Dorian, Phrygian).
- **Multi-Part Arrangement**: The engine simulates an 8-channel ensemble including Lute, Recorder, Choir Pads, Tremolo Strings, Organ, Bass Viol, Bells, and Percussion.
- **Tactile Sound Effects**: Impactful, armor-clashing sound effects reinforce the weight of tactical decisions.

## Core Features
- **Hexagonal Strategy**: Classic grid-based tactical movement.
- **Economic Management**: Capture settlements (villages, castles, mines) to increase gold income.
- **Automaton AI**: Challenging bot opponents that simulate human strategic patterns.
- **Multi-device Reliability**: Robust save/load system for continuous play across different sessions.
