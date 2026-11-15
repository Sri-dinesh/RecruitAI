/**
 * Minimal LangGraph-compatible state machine.
 *
 * The Python backend builds its agent with `langgraph.graph.StateGraph`: a
 * single entry point, nodes that return partial state, one conditional edge
 * from the supervisor, and every branch ending at `END`. No other LangGraph
 * feature is used.
 *
 * Rather than add `@langchain/langgraph` (and its LangChain dependency tree)
 * for that small surface, this module implements the same execution contract:
 *
 * - `invoke(state)` starts at the entry point and shallow-merges each node's
 *   returned patch into the running state (Python dict update semantics);
 * - a conditional edge calls its router after the node has merged, resolves
 *   the returned key through the optional mapping, and jumps to that node;
 * - a normal edge jumps to its target, and `END` stops the run;
 * - a bounded step count turns an accidental cycle into a clear error instead
 *   of an infinite loop.
 *
 * Keeping the runtime local means graph tests need no network, no extra
 * packages, and the topology is inspectable at runtime (`nodes`, `entry`).
 */

export const END = '__end__';

export type StatePatch<S> = Partial<S> | S;

export type GraphNode<S> = (state: S) => StatePatch<S> | Promise<StatePatch<S>>;

export type GraphRouter<S> = (state: S) => string;

export interface GraphDefinition<S> {
  readonly entry: string;
  readonly nodes: ReadonlyMap<string, GraphNode<S>>;
  readonly edges: ReadonlyMap<string, string>;
  readonly conditionalEdges: ReadonlyMap<
    string,
    { readonly router: GraphRouter<S>; readonly mapping?: Readonly<Record<string, string>> }
  >;
}

export interface CompiledGraph<S> {
  readonly entry: string;
  /** Ordered node names, useful for topology assertions and diagnostics. */
  readonly nodes: readonly string[];
  invoke(input: S): Promise<S>;
}

const DEFAULT_MAX_STEPS = 50;

function cloneState<S>(input: S): S {
  if (typeof input !== 'object' || input === null) {
    return input;
  }
  return { ...input };
}

/** Build and compile a graph in one call, mirroring `StateGraph(...).compile()`. */
export class StateGraph<S extends object> {
  private readonly nodes = new Map<string, GraphNode<S>>();
  private readonly edges = new Map<string, string>();
  private readonly conditionalEdges = new Map<
    string,
    { router: GraphRouter<S>; mapping?: Readonly<Record<string, string>> }
  >();
  private entry: string | undefined;
  private readonly maxSteps: number;

  constructor(options: { readonly maxSteps?: number } = {}) {
    this.maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS;
  }

  addNode(name: string, node: GraphNode<S>): this {
    if (this.nodes.has(name)) {
      throw new Error(`Graph node '${name}' is already registered.`);
    }
    this.nodes.set(name, node);
    return this;
  }

  setEntryPoint(name: string): this {
    this.entry = name;
    return this;
  }

  addEdge(from: string, to: string): this {
    this.edges.set(from, to);
    return this;
  }

  addConditionalEdges(
    from: string,
    router: GraphRouter<S>,
    mapping?: Readonly<Record<string, string>>,
  ): this {
    this.conditionalEdges.set(from, mapping ? { router, mapping } : { router });
    return this;
  }

  compile(): CompiledGraph<S> {
    const entry = this.entry;
    if (!entry) {
      throw new Error('Graph has no entry point.');
    }
    if (!this.nodes.has(entry)) {
      throw new Error(`Graph entry point '${entry}' is not a registered node.`);
    }

    const definition: GraphDefinition<S> = {
      entry,
      nodes: new Map(this.nodes),
      edges: new Map(this.edges),
      conditionalEdges: new Map(this.conditionalEdges),
    };

    return compileDefinition(definition, this.maxSteps);
  }
}

/**
 * Compile a pre-built definition. Exposed so a graph can be assembled
 * declaratively (and serialized for diagnostics) without the builder class.
 */
export function compileDefinition<S extends object>(
  definition: GraphDefinition<S>,
  maxSteps = DEFAULT_MAX_STEPS,
): CompiledGraph<S> {
  const { entry, nodes, edges, conditionalEdges } = definition;

  if (!nodes.has(entry)) {
    throw new Error(`Graph entry point '${entry}' is not a registered node.`);
  }

  return {
    entry,
    nodes: [...nodes.keys()],
    async invoke(input: S): Promise<S> {
      const state = cloneState(input);
      let current: string = entry;
      let steps = 0;

      while (current !== END) {
        const node = nodes.get(current);
        if (!node) {
          throw new Error(`Graph routed to unknown node '${current}'.`);
        }

        steps += 1;
        if (steps > maxSteps) {
          throw new Error(`Graph exceeded the ${maxSteps}-step limit at node '${current}'.`);
        }

        const patch = await node(state);
        Object.assign(state, patch);

        const conditional = conditionalEdges.get(current);
        if (conditional) {
          const routed = conditional.router(state);
          const target = conditional.mapping?.[routed] ?? routed;
          current = target;
          continue;
        }

        current = edges.get(current) ?? END;
      }

      return state;
    },
  };
}
