import { AIConfig, DEFAULT_AI_CONFIG } from './AIConfig';
import { runSimulation } from './Simulator';

export interface Individual {
  config: AIConfig;
  fitness: number;
}

export function mutate(config: AIConfig, rate: number = 0.1): AIConfig {
  const newConfig = { ...config };
  for (const key in newConfig) {
    if (Math.random() < rate) {
      const val = (newConfig as any)[key];
      const change = 1 + (Math.random() * 0.4 - 0.2); // +/- 20%
      (newConfig as any)[key] = val * change;
    }
  }
  return newConfig;
}

export function crossover(parentA: AIConfig, parentB: AIConfig): AIConfig {
  const child = { ...parentA };
  for (const key in child) {
    if (Math.random() < 0.5) {
      (child as any)[key] = (parentB as any)[key];
    }
  }
  return child;
}

export function evolve(populationSize: number = 10, generations: number = 3) {
  let population: Individual[] = Array.from({ length: populationSize }).map(() => ({
    config: mutate(DEFAULT_AI_CONFIG, 0.5),
    fitness: 0
  }));

  for (let g = 0; g < generations; g++) {
    console.log(`Generation ${g}...`);
    
    // Evaluate fitness by running matches
    // This is simplified: each individual plays against the default AI
    for (const ind of population) {
      let score = 0;
      for (let match = 0; match < 2; match++) {
        const result = runSimulation([ind.config, DEFAULT_AI_CONFIG]);
        if (result.winnerId === 0) score += 100;
        else if (result.winnerId === null) score += 10;
        score += result.playerStats[0].finalIncome * 0.1;
      }
      ind.fitness = score;
    }

    // Sort by fitness
    population.sort((a, b) => b.fitness - a.fitness);
    console.log(`Best fitness: ${population[0].fitness}`);

    // Selection & Reproduction
    const newPopulation: Individual[] = [population[0], population[1]]; // Keep survivors
    while (newPopulation.length < populationSize) {
      const parentA = population[Math.floor(Math.random() * 3)].config;
      const parentB = population[Math.floor(Math.random() * 3)].config;
      const child = mutate(crossover(parentA, parentB));
      newPopulation.push({ config: child, fitness: 0 });
    }
    population = newPopulation;
  }

  return population[0].config;
}
