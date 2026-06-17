import json
# Import the typing module to provide type hints for better code readability and maintainability.
from typing import List, Dict, Any, Optional

# Base class for the Agentic Framework.
# This class defines the structure for agents that follow the Planner-Executor-Critic pattern.
class AgenticFramework:
    def __init__(self, model_name: str = "granite-4.1"):
        # The model name being used for the agents, pinned to a specific version for consistency.
        self.model_name = model_name
        # Hard context includes verbatim instructions and critical parameters that must never be pruned.
        self.hard_context = ""
        # Soft context includes conversation history and chain of thought, which can be compacted.
        self.soft_context = []
        # Maximum context window limit (conceptual).
        self.context_window_limit = 4096

    def update_hard_context(self, text: str):
        # Updates the hard context with new verbatim instructions.
        # This context is preserved throughout the session.
        self.hard_context = text

    def add_soft_context(self, item: str):
        # Adds an item to the soft context and checks if compaction is necessary.
        self.soft_context.append(item)
        self._check_context_limit()

    def _check_context_limit(self):
        # Check if total context (hard + soft) exceeds 50% of the window.
        # This logic triggers the compaction process if the threshold is met.
        total_estimated_tokens = len(self.hard_context.split()) + sum(len(c.split()) for c in self.soft_context)
        if total_estimated_tokens > (self.context_window_limit * 0.5):
            self._compact_soft_context()

    def _compact_soft_context(self):
        # Placeholder for importance-based scoring and winnowing.
        # In a real implementation, this would call a 'Utility Agent' to score relevance.
        print("--- Triggering Context Layer Compaction (50% threshold reached) ---")
        # Keep only the last 5 items as a naive compaction for this boilerplate.
        self.soft_context = self.soft_context[-5:]

    def planner(self, task: str) -> List[str]:
        # The Planner breaks down a high-level task into a sequence of actionable sub-tasks.
        # In practice, this would be a LangChain prompt returning a structured list.
        print(f"Planner [Personality: Analytical]: Planning for task - {task}")
        return [f"Sub-task 1 for {task}", f"Sub-task 2 for {task}"]

    def executor(self, sub_task: str) -> str:
        # The Executor carries out a specific sub-task.
        # It focuses on execution and output generation.
        print(f"Executor [Personality: Direct]: Executing - {sub_task}")
        return f"Result of {sub_task}"

    def critic(self, result: str) -> bool:
        # The Critic reviews the executor's output for accuracy and relevance.
        # It uses a natural language assessment to determine if regeneration is needed.
        print(f"Critic [Personality: Skeptical]: Reviewing result - {result}")
        # Simulated logic: if 'hallucination' is detected, return False to trigger repeat.
        if "hallucination" in result.lower():
            return False
        return True

    def memory_manager(self, task: str, final_output: str, feedback: Optional[str] = None):
        # The Memory Manager runs at the end of the chain to extract 'Lessons Learned'.
        # It creates or updates a structured JSON record for future tool-based retrieval.
        print("Memory Manager [Personality: Synthetic]: Recording lessons learned...")
        lesson = {
            "task": task,
            "outcome": final_output,
            "feedback": feedback,
            "lessons": ["Always verify tool call parameters", "Context compaction improved response speed"]
        }
        # Save to a local JSON file (simulating the 'Lessons Learned' storage).
        with open("lessons_learned.json", "a") as f:
            f.write(json.dumps(lesson) + "\n")

    def run_flow(self, task: str):
        # Orchestrates the full Agentic Flow.
        plan = self.planner(task)
        final_results = []

        for step in plan:
            success = False
            attempts = 0
            while not success and attempts < 2:
                output = self.executor(step)
                if self.critic(output):
                    success = True
                    final_results.append(output)
                else:
                    print("--- Critic flagged output. Regenerating last step... ---")
                    attempts += 1

            if not success:
                print(f"Failed to produce a satisfactory result for {step} after 2 attempts.")

        self.memory_manager(task, " ".join(final_results))

if __name__ == "__main__":
    # Example usage of the framework.
    framework = AgenticFramework()
    framework.update_hard_context("System Mission: Provide accurate technical documentation.")
    framework.run_flow("Develop a knowledge graph integration")
