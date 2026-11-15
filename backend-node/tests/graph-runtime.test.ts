import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { END, StateGraph } from '../src/graph/runtime.js';

interface TestState {
  history: string[];
  intent?: string;
}

describe('StateGraph runtime', () => {
  it('runs the entry node, merges patches and stops at END', async () => {
    const builder = new StateGraph<TestState>();
    builder.addNode('start', (state) => ({ history: [...state.history, 'start'] }));
    builder.addNode('next', (state) => ({ history: [...state.history, 'next'] }));
    builder.setEntryPoint('start');
    builder.addEdge('start', 'next');
    builder.addEdge('next', END);

    const graph = builder.compile();
    const result = await graph.invoke({ history: [] });

    assert.deepEqual(result.history, ['start', 'next']);
    assert.deepEqual(graph.nodes, ['start', 'next']);
    assert.equal(graph.entry, 'start');
  });

  it('routes conditional edges through the mapping', async () => {
    const builder = new StateGraph<TestState>();
    builder.addNode('router', (state) => ({ intent: state.history[0] ?? '' }));
    builder.addNode('a', () => ({ history: ['a'] }));
    builder.addNode('b', () => ({ history: ['b'] }));
    builder.setEntryPoint('router');
    builder.addConditionalEdges('router', (state) => state.intent ?? 'missing', {
      alpha: 'a',
      beta: 'b',
    });
    builder.addEdge('a', END);
    builder.addEdge('b', END);

    const graph = builder.compile();
    assert.deepEqual((await graph.invoke({ history: ['alpha'] })).history, ['a']);
    assert.deepEqual((await graph.invoke({ history: ['beta'] })).history, ['b']);
  });

  it('rejects duplicate nodes, missing entry points and unknown targets', async () => {
    const builder = new StateGraph<TestState>();
    builder.addNode('start', () => ({}));
    assert.throws(() => builder.addNode('start', () => ({})), /already registered/);
    assert.throws(() => builder.compile(), /no entry point/);

    const unknownEntry = new StateGraph<TestState>();
    unknownEntry.setEntryPoint('nope');
    assert.throws(() => unknownEntry.compile(), /not a registered node/);

    const unknownRoute = new StateGraph<TestState>();
    unknownRoute.addNode('start', () => ({ intent: 'ghost' }));
    unknownRoute.setEntryPoint('start');
    unknownRoute.addConditionalEdges('start', (state) => state.intent ?? '');
    const graph = unknownRoute.compile();
    await assert.rejects(() => graph.invoke({ history: [] }), /unknown node 'ghost'/);
  });

  it('guards against graph cycles with a step limit', async () => {
    const builder = new StateGraph<TestState>({ maxSteps: 3 });
    builder.addNode('loop', (state) => ({ history: [...state.history, 'tick'] }));
    builder.setEntryPoint('loop');
    builder.addEdge('loop', 'loop');
    const graph = builder.compile();

    await assert.rejects(() => graph.invoke({ history: [] }), /exceeded the 3-step limit/);
  });

  it('does not mutate the caller state object', async () => {
    const builder = new StateGraph<TestState>();
    builder.addNode('start', (state) => ({ history: [...state.history, 'added'] }));
    builder.setEntryPoint('start');
    builder.addEdge('start', END);
    const graph = builder.compile();

    const initial: TestState = { history: ['original'] };
    const result = await graph.invoke(initial);

    assert.deepEqual(initial.history, ['original']);
    assert.deepEqual(result.history, ['original', 'added']);
  });
});
