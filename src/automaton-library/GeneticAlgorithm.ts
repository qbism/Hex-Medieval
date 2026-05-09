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

export async function evolveAsync(
  populationSize: number = 10, 
  generations: number = 3,
  onProgress?: (generation: number, bestFitness: number) => void
) {
  let population: Individual[] = Array.from({ length: populationSize }).map(() => ({
    config: mutate(DEFAULT_AI_CONFIG, 0.5),
    fitness: 0
  }));

  for (let g = 0; g < generations; g++) {
    // Evaluate fitness by running matches in parallel for each individual
    await Promise.all(population.map(async (ind) => {
      if (ind.fitness > 0) return; // Skip if already evaluated (survivors)
      
      let totalScore = 0;
      const matches = [
        runSimulation([ind.config, DEFAULT_AI_CONFIG]),
        runSimulation([ind.config, DEFAULT_AI_CONFIG])
      ];
      
      const results = await Promise.all(matches);
      
      results.forEach((result) => {
        if (result.winnerId === 0) totalScore += 100;
        else if (result.winnerId === null) totalScore += 10;
        totalScore += result.playerStats[0].finalIncome * 0.1;
      });
      
      ind.fitness = totalScore;
      
      if (onProgress) {
        const evaluated = population.filter(p => p.fitness > 0);
        const currentBestSoFar = evaluated.length > 0 
          ? Math.max(...evaluated.map(p => p.fitness))
          : 0;
        onProgress(g, Math.max(currentBestSoFar, totalScore / 2));
      }
    }));

    // Sort by fitness
    population.sort((a, b) => b.fitness - a.fitness);

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
