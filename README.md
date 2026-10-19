# Pottery Rib Maker

Design profile ribs for the potter's wheel, and 3D print them. You describe the mug, pot, or bowl that you want to throw. The app cuts a rib whose edge is that pot's outside wall, and it puts a height scale on the rib. The app gives you an STL file to print.

![The app showing a rounded-base mug, its rib with a centimeter scale, the rib on the wheel in 3D, and a passing print check](docs/screenshot.png)

- **The rib throws the pot you drew.** The working edge follows the pot's wall from the base to the rim. Hold the rib to the clay while the wheel turns, and the wall takes that shape.
- **The rib has a height scale.** Ticks and numbers run up the back edge in cm, mm, or inches. A long line marks the rim, and you can add lines at any height, such as where a handle goes.
- **The rib allows for shrinkage.** You enter the size of the fired pot and your clay's shrinkage. The app makes the rib bigger by that amount, so the pot leaves the kiln at the size you entered.
- **You see the pot before you print.** A 3D view shows the rib against the thrown pot on the wheel, and the fired pot alone. The print plate view shows the STL file on the bed of your printer.

## Run it

You need [Node.js](https://nodejs.org) 22 or later.

```sh
git clone https://github.com/aasimsani/pottery-rib-maker.git
cd pottery-rib-maker
npm install
npm run dev
```

Then open http://localhost:5173. Everything runs in your browser, and your browser also saves your shapes.

To host the app yourself, run `npm run build` and put the `dist/` folder on any static host.

To host the app on Cloudflare Workers, run `npx wrangler login` once. Then run `npm run deploy`, which builds the app and publishes it. The file `wrangler.jsonc` configures Cloudflare to serve the build as static assets at `aasimsani.net/projects/pottery-rib-maker`. If you deploy a fork, replace `account_id` and `routes` in that file with your own.

The workflow `.github/workflows/ci.yml` runs the tests and the build on every pull request. The workflow `.github/workflows/deploy.yml` deploys every push to `main` after the tests and the build pass. You can also start it from the **Actions** tab. It needs a Cloudflare API token from the **Edit Cloudflare Workers** template, saved as the repository secret `CLOUDFLARE_API_TOKEN`.

## Make a rib

1. **Pick a shape.** Click a shape in the **Rib library**. **Pots** holds profile ribs for mugs, pots, and bowls. **Your printed set** holds the five ribs of the [Ceramic Rib Tool Set](https://makerworld.com/en/models/1963257-ceramic-rib-tool-set) on MakerWorld.
2. **Draw the pot.** Drag the points on the rib drawing to reshape the pot's wall. To add a point, drag a **＋** between two points, or double-click anywhere on the drawing. Select a point to make it a **corner**, which gives a crisp edge such as the carination of an angled pot, or to delete it. **Start over** gives you a plain cylinder at the same size, and **Undo** (⌘Z or Ctrl+Z) steps back. To type exact numbers, use the table under **Pot**. The numbers are the height and the outside Ø of the fired pot.
   - The arrow keys move the selected point by the snap step, and Shift moves it 5 mm. Delete removes it, and C makes it a corner.
   - The **Drawing limits** stop shapes that cannot work. Each point stays at least 2 mm above the point below it, and no point gets narrower than Ø 20 mm. A point also stops where the wall would fold back on itself, because the rib could not pull away from that wall. You can change the limits and the 0.5 mm snap step.
3. **Set the size.** **Height** and **Widest Ø** resize the whole pot. With **Keep proportions** on, the two change together. Enter your clay's **shrinkage**. Most stoneware shrinks 10–14% from wet to fired.
4. **Shape the rib.** **Narrowest width** sets how much plastic is behind the working edge. **Above the rim** makes the rib taller than the pot, so the rim line sits on the rib. **Both long edges throw the pot** makes the back edge a second working edge.
5. **Set the height scale.** Pick the units and whether the numbers show the wet height or the fired height. Enter heights in **More marks at** to add lines.
6. **Check the rib.** Fix every error that the **Print check** marks.
7. **Download the STL file**, and then slice it. To print several ribs together, click **Add to plate** for each one. Then click **Download plate (.3mf)**, which saves one file with every rib placed on the bed.

## Print it

The defaults suit a Bambu Lab P2S with a 0.4 mm nozzle. To use a different bed size, change it under **Printer settings**.

- Print the rib flat, with the marks facing up, exactly as exported. Turn the brim off.
- Use PETG, because it survives water and clay grit better than PLA. The print project for the Ceramic Rib Tool Set uses PETG at 0.12 mm layers, with 4 walls and 40% gyroid infill.
- To print the marks in a second color, add a filament change at the layer where the marks start.
- Rub the working edge with 400-grit wet sandpaper, so it leaves a smooth wall.

## Use it

Stand the rib on the wheel head or the bat, so the scale counts up from where the pot sits. Throw the wall a little taller than the rim line. Then hold the working edge to the clay from the base up while the wheel turns slowly, and trim the rim level with the line.

## How it works

The app samples a centripetal Catmull-Rom curve through the measurements. Points marked as corners split the curve into separate runs. The curve becomes the rib's working edge, and the app extrudes the outline with three.js. The marks are boxes that sink 0.2 mm into the top face, so the slicer joins them to the rib. The tests check these facts for every shape in the library:

- The rib is a closed solid.
- The working edge matches the pot.
- Every mark sits on the rib and clear of the finger hole.

## License

MIT
