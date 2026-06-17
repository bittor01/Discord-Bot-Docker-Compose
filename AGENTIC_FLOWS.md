# Designing Practical Agentic Flows with LangChain

This document outlines a standardized architecture for building robust, self-correcting agentic systems using LangChain, optimized for local model execution (e.g., LM Studio, Dockerized runners).

## 1. Core Architecture: The Planner-Executor-Critic Pattern

Every chain in this framework follows a recursive validation pattern to minimize hallucinations and ensure alignment with the target goal.

### The Planner
- **Role**: Breaks down the user's high-level request into a sequence of discrete, actionable steps or "sub-tasks."
- **Output**: A structured plan (often JSON) that the Executor can follow.
- **Personality**: Analytical, foresight-oriented, and cautious.

### The Executor
- **Role**: Carries out the individual steps of the plan using available tools, skills, or direct text generation.
- **Context**: Focuses strictly on the current step provided by the Planner.

### The Critic
- **Role**: Reviews every output (text, tool calls, or skills) before it is finalized or executed.
- **Logic**:
    - Performs a natural language assessment of the output's accuracy and relevance.
    - **Regeneration Trigger**: If the Critic is unsure about the accuracy of a tool call or the logic of a response, it triggers a "Regenerate" signal.
    - **Self-Correction**: The last step is generated again (potentially with adjusted prompts or a "lighter" model for a second opinion) to see if a more grounded result emerges.

---

## 2. Context Layer Management

Efficiently managing the model's context window is critical for long-running tasks. We distinguish between **Hard Context** and **Soft Context**.

### Context Definitions
- **Hard Context**:
    - Verbatim user instructions.
    - Mission-critical parameters (e.g., system constraints, security protocols).
    - Current task-relevant memories retrieved from long-term storage.
    - *Constraint*: Must be preserved in its original form regardless of window pressure.
- **Soft Context**:
    - Conversation history.
    - Chain of thought from previous steps.
    - Collateral information retrieved during the task.

### The 50% Rule & Compaction
When the total context (Hard + Soft) exceeds **50% of the model's context window**, the system triggers a **Context Layer Compaction**:
1. **Importance Scoring**: A specialized prompt (or a lighter model like Granite 4.1) evaluates each piece of Soft Context against the current active task.
2. **Winnowing**: Items with low relevance scores are summarized or pruned.
3. **Hard Context Preservation**: The Hard Context remains untouched.

---

## 3. Personality Arrays (Prompt Arrays)

Instead of a single monolithic system prompt, we use an **Array of Special Prompts**. Each segment of the LangChain uses a different "personality" defined by unique prompts and model settings.

- **Segment A (Discovery)**: A prompt optimized for broad retrieval and curiosity.
- **Segment B (Analysis)**: A prompt optimized for logical deduction and skepticism.
- **Segment C (Memory)**: A prompt optimized for synthesis and pattern recognition.

By switching "personalities" between chain steps, the system can leverage specialized reasoning patterns for specific sub-tasks.

---

## 4. The Context Layer & Memory Manager

RAG often provides context in "shreds" that lack cohesion. We move beyond simple RAG by using a **Hybrid Knowledge Graph and JSON** approach.

### The Memory Manager Role
At the end of every chain, a **Memory Manager** agent is invoked.
1. **Lessons Learned**: It reviews the task's execution and identifies "Lessons Learned."
2. **Feedback Integration**: It specifically looks for user feedback (positive or negative) and synthesizes why a particular approach succeeded or failed.
3. **Conflict Resolution**: If a new lesson contradicts an old one, the agent should ask the user for clarification rather than silently overwriting.

### Storage Structure
- **Structured JSON**: For flat "lessons learned" and feedback loops.
- **Knowledge Graph (e.g., FalkorDB)**: For relational concepts and entities where the "shredded" nature of RAG would lose the bigger picture.
- **Tool-Based Retrieval**: Instead of keeping the entire memory in the active context window, agents use specialized **Tool Calls** to perform semantic searches over the Graph/JSON hybrid when needed.

---

## 5. Local Execution Environment

This architecture is designed to run efficiently on local hardware:
- **Model Runners**: Docker-based runners or LM Studio.
- **Efficiency**: Use lighter models (e.g., Qwen or Granite 4) for high-frequency tasks like Critic reviews and Importance Scoring, saving the "heavy" reasoning for the main Planner/Executor roles.
- **Tooling**: Heavy reliance on local semantic search tools and structured JSON file storage.
