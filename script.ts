import { execSync } from 'child_process';
try {
  console.log(execSync('git status').toString());
  console.log(execSync('git checkout HEAD -- src/automaton-library/barbarianAI.ts src/automaton-library/opportunityPeril.ts src/automaton-library/utils.ts').toString());
} catch (e) {
  console.error("Git checkout failed", e);
}
