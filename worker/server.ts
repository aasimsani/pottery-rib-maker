import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { DESIGN_LOOP, REVIEW_DESIGN } from '../src/mcp/prompts';

export type CallTab = (method: string, params?: unknown) => Promise<unknown>;

interface TabImage { name: string; dataUrl: string }

// reply() turns what the tab sent back into MCP content. Preview images become image blocks, and the rest goes as JSON.
function reply(result: unknown) {
  const { images, ...rest } = (result ?? {}) as { images?: TabImage[] };
  const content: ({ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string })[] = [
    { type: 'text', text: JSON.stringify(rest, null, 1) },
  ];
  for (const im of images ?? []) {
    content.push({ type: 'text', text: im.name });
    content.push({ type: 'image', data: im.dataUrl.slice(im.dataUrl.indexOf(',') + 1), mimeType: 'image/png' });
  }
  return { content };
}

const view = z.boolean().optional().describe('Return the rib drawing with the result, so you can see the change.');
const point = z.object({ z: z.number(), d: z.number(), sharp: z.boolean().optional() });

// buildServer() makes a fresh MCP server for one request. Every tool forwards to the tab, which applies the change
// through the app's own guards and answers after the page shows it, with the new rib and print check.
export function buildServer(callTab: CallTab): McpServer {
  const server = new McpServer({ name: 'pottery-rib', version: '0.1.0' });
  // The SDK's overloads can't infer through a generic helper, so the helper narrows registerTool to the one shape it uses.
  const register = server.registerTool.bind(server) as (name: string, config: { description: string; inputSchema: z.ZodObject }, cb: (a: never) => Promise<unknown>) => unknown;
  const tool = <S extends z.ZodObject>(name: string, description: string, inputSchema: S, run: (a: z.infer<S>) => Promise<unknown>) =>
    register(name, { description, inputSchema }, async (a: z.infer<S>) => {
      try { return reply(await run(a)); } catch (e) {
        return { content: [{ type: 'text' as const, text: e instanceof Error ? e.message : String(e) }], isError: true };
      }
    });
  const apply = (ops: unknown[], v?: boolean) => callTab('apply', { ops, view: v ?? false });

  tool('get_state', 'Read the whole design: settings (including the pot profile, base first), the rib\'s size, the clay estimate and the print check.',
    z.object({}), () => callTab('getState'));
  tool('view', 'See the design. "drawing" is the rib as printed beside the thrown pot, and "3d" is the 3D view in the chosen mode.',
    z.object({ which: z.enum(['drawing', '3d', 'both']).default('both'), mode: z.enum(['wheel', 'fired', 'print']).optional().describe('wheel is the pot as thrown, fired is after shrinkage, print is the bed') }),
    (a) => callTab('view', a));
  tool('update_settings', 'Merge a patch into the settings, such as {"thick": 5} or {"units": "in"}. Unknown keys and wrong types are rejected.',
    z.object({ patch: z.record(z.string(), z.unknown()), view }), (a) => apply([{ op: 'settings', patch: a.patch }], a.view));
  tool('set_profile', 'Replace the pot profile, base first, as heights z and outside diameters d in mm. It is rejected when points break the minimum gap or Ø, or when the curve folds back.',
    z.object({ profile: z.array(point).min(2), view }), (a) => apply([{ op: 'setProfile', profile: a.profile }], a.view));
  tool('insert_point', 'Add a point between the base and the rim.', z.object({ z: z.number(), d: z.number(), view }), (a) => apply([{ op: 'insertPoint', z: a.z, d: a.d }], a.view));
  tool('move_point', 'Move point index (0 is the base) towards z and d. Like a drag, it stops at the guards instead of failing.',
    z.object({ index: z.number().int(), z: z.number(), d: z.number(), view }), (a) => apply([{ op: 'movePoint', index: a.index, z: a.z, d: a.d }], a.view));
  tool('remove_point', 'Remove a point between the base and the rim.', z.object({ index: z.number().int(), view }), (a) => apply([{ op: 'removePoint', index: a.index }], a.view));
  tool('set_corner', 'Make a point a corner, such as a carination, or smooth it again.',
    z.object({ index: z.number().int(), sharp: z.boolean(), view }), (a) => apply([{ op: 'setCorner', index: a.index, sharp: a.sharp }], a.view));
  tool('list_shapes', 'List the library shapes and the user\'s saved shapes, for pick_shape.', z.object({}), () => callTab('listShapes'));
  tool('pick_shape', 'Load a shape from list_shapes: its name, profile, body width, reach above the rim and mirror.',
    z.object({ name: z.string(), view }), (a) => apply([{ op: 'pickShape', name: a.name }], a.view));
  tool('batch', 'Apply several changes in one go. Either all apply or none does. Each op is one of: {op:"settings",patch}, {op:"setProfile",profile}, {op:"insertPoint",z,d}, {op:"movePoint",index,z,d}, {op:"removePoint",index}, {op:"setCorner",index,sharp}, {op:"pickShape",name}.',
    z.object({ ops: z.array(z.record(z.string(), z.unknown())).min(1), view }), (a) => apply(a.ops, a.view));
  tool('checkpoint', 'Save the current design under a name, with its drawing, before you experiment.', z.object({ name: z.string() }), (a) => callTab('checkpoint', a));
  tool('restore', 'Put a saved checkpoint back.', z.object({ name: z.string(), view }), (a) => callTab('restore', a));
  tool('compare', 'Show two checkpoints\' drawings side by side. Use "current" for the design as it is now.', z.object({ a: z.string(), b: z.string() }), (a) => callTab('compare', a));
  tool('export', 'Save a file through the tab\'s download, the same as its buttons: the STL (two files when the marks are a separate part), the drawing as SVG, or the 3MF.',
    z.object({ format: z.enum(['stl', 'svg', '3mf']) }), (a) => callTab('export', a));

  const say = (text: string) => ({ messages: [{ role: 'user' as const, content: { type: 'text' as const, text } }] });
  server.registerPrompt('design_rib', { title: 'Design a rib', description: 'Work on the rib in the open tab in look, change and look-again rounds.',
    argsSchema: z.object({ idea: z.string().optional().describe('The pot the rib should throw') }) },
  ({ idea }) => say(`${DESIGN_LOOP}${idea ? `\n\nThe user's idea: ${idea}` : ''}`));
  server.registerPrompt('review_design', { title: 'Review the design', description: 'Judge the current rib and suggest the next change.' }, () => say(REVIEW_DESIGN));
  return server;
}
