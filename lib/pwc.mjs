import { basisInitialize, WasmModule, Application, Mouse, Keyboard, FILLMODE_FILL_WINDOW, RESOLUTION_AUTO, Picker, Vec3, Vec4, Color, Quat, Vec2, Entity, Asset, GAMMA_SRGB, GAMMA_NONE, XRTYPE_VR, PROJECTION_ORTHOGRAPHIC, PROJECTION_PERSPECTIVE, TONEMAP_NONE, TONEMAP_LINEAR, TONEMAP_FILMIC, TONEMAP_HEJL, TONEMAP_ACES, TONEMAP_ACES2, TONEMAP_NEUTRAL, SHADOW_PCF3_32F, SHADOW_PCF1_16F, SHADOW_PCF1_32F, SHADOW_PCF3_16F, SHADOW_PCF5_16F, SHADOW_PCF5_32F, SHADOW_VSM_16F, SHADOW_VSM_32F, SHADOW_PCSS_32F, StandardMaterial, SCALEMODE_BLEND, SCALEMODE_NONE, EnvLighting, LAYERID_SKYBOX } from 'playcanvas';

/**
 * Base class for all PlayCanvas Web Components that initialize asynchronously.
 */
class AsyncElement extends HTMLElement {
    /** @ignore */
    constructor() {
        super();
        this._readyPromise = new Promise((resolve) => {
            this._readyResolve = resolve;
        });
    }
    get closestApp() {
        var _a;
        return (_a = this.parentElement) === null || _a === void 0 ? void 0 : _a.closest('pc-app');
    }
    get closestEntity() {
        var _a;
        return (_a = this.parentElement) === null || _a === void 0 ? void 0 : _a.closest('pc-entity');
    }
    /**
     * Called when the element is fully initialized and ready.
     * Subclasses should call this when they're ready.
     */
    _onReady() {
        this._readyResolve();
        this.dispatchEvent(new CustomEvent('ready'));
    }
    /**
     * Returns a promise that resolves with this element when it's ready.
     * @returns A promise that resolves with this element when it's ready.
     */
    ready() {
        return this._readyPromise.then(() => this);
    }
}

/**
 * The ModuleElement interface provides properties and methods for manipulating
 * {@link https://developer.playcanvas.com/user-manual/engine/web-components/tags/pc-module/ | `<pc-module>`} elements.
 * The ModuleElement interface also inherits the properties and methods of the
 * {@link HTMLElement} interface.
 */
class ModuleElement extends HTMLElement {
    /** @ignore */
    constructor() {
        super();
        this.loadPromise = this.loadModule();
    }
    async loadModule() {
        const name = this.getAttribute('name');
        const glue = this.getAttribute('glue');
        const wasm = this.getAttribute('wasm');
        const fallback = this.getAttribute('fallback');
        if (name === 'Basis') {
            basisInitialize({
                glueUrl: glue,
                wasmUrl: wasm,
                fallbackUrl: fallback
            });
        }
        else {
            WasmModule.setConfig(name, {
                glueUrl: glue,
                wasmUrl: wasm,
                fallbackUrl: fallback
            });
            await new Promise((resolve) => {
                WasmModule.getInstance(name, () => resolve());
            });
        }
    }
    getLoadPromise() {
        return this.loadPromise;
    }
}
customElements.define('pc-module', ModuleElement);

/**
 * The AppElement interface provides properties and methods for manipulating
 * {@link https://developer.playcanvas.com/user-manual/engine/web-components/tags/pc-app/ | `<pc-app>`} elements.
 * The AppElement interface also inherits the properties and methods of the
 * {@link HTMLElement} interface.
 */
class AppElement extends AsyncElement {
    /**
     * Creates a new AppElement instance.
     *
     * @ignore
     */
    constructor() {
        super();
        /**
         * The canvas element.
         */
        this._canvas = null;
        this._alpha = true;
        this._antialias = true;
        this._depth = true;
        this._stencil = true;
        this._highResolution = true;
        this._hierarchyReady = false;
        this._picker = null;
        this._hasPointerListeners = {
            pointerenter: false,
            pointerleave: false,
            pointerdown: false,
            pointerup: false,
            pointermove: false
        };
        this._hoveredEntity = null;
        this._pointerHandlers = {
            pointermove: null,
            pointerdown: null,
            pointerup: null
        };
        /**
         * The PlayCanvas application instance.
         */
        this.app = null;
        // Bind methods to maintain 'this' context
        this._onWindowResize = this._onWindowResize.bind(this);
    }
    async connectedCallback() {
        // Get all pc-module elements that are direct children of the pc-app element
        const moduleElements = this.querySelectorAll(':scope > pc-module');
        // Wait for all modules to load
        await Promise.all(Array.from(moduleElements).map(module => module.getLoadPromise()));
        // Create and append the canvas to the element
        this._canvas = document.createElement('canvas');
        this.appendChild(this._canvas);
        // Initialize the PlayCanvas application
        this.app = new Application(this._canvas, {
            graphicsDeviceOptions: {
                alpha: this._alpha,
                antialias: this._antialias,
                depth: this._depth,
                stencil: this._stencil
            },
            keyboard: new Keyboard(window),
            mouse: new Mouse(this._canvas)
        });
        this.app.graphicsDevice.maxPixelRatio = this._highResolution ? window.devicePixelRatio : 1;
        this.app.setCanvasFillMode(FILLMODE_FILL_WINDOW);
        this.app.setCanvasResolution(RESOLUTION_AUTO);
        this._pickerCreate();
        // Get all pc-asset elements that are direct children of the pc-app element
        const assetElements = this.querySelectorAll(':scope > pc-asset');
        Array.from(assetElements).forEach((assetElement) => {
            assetElement.createAsset();
            const asset = assetElement.asset;
            if (asset) {
                this.app.assets.add(asset);
            }
        });
        // Get all pc-material elements that are direct children of the pc-app element
        const materialElements = this.querySelectorAll(':scope > pc-material');
        Array.from(materialElements).forEach((materialElement) => {
            materialElement.createMaterial();
        });
        // Create all entities
        const entityElements = this.querySelectorAll('pc-entity');
        Array.from(entityElements).forEach((entityElement) => {
            entityElement.createEntity(this.app);
        });
        // Build hierarchy
        entityElements.forEach((entityElement) => {
            entityElement.buildHierarchy(this.app);
        });
        this._hierarchyReady = true;
        // Load assets before starting the application
        this.app.preload(() => {
            // Start the application
            this.app.start();
            // Handle window resize to keep the canvas responsive
            window.addEventListener('resize', this._onWindowResize);
            this._onReady();
        });
    }
    disconnectedCallback() {
        this._pickerDestroy();
        // Clean up the application
        if (this.app) {
            this.app.destroy();
            this.app = null;
        }
        // Remove event listeners
        window.removeEventListener('resize', this._onWindowResize);
        // Remove the canvas
        if (this._canvas && this.contains(this._canvas)) {
            this.removeChild(this._canvas);
            this._canvas = null;
        }
    }
    _onWindowResize() {
        if (this.app) {
            this.app.resizeCanvas();
        }
    }
    _pickerCreate() {
        const { width, height } = this.app.graphicsDevice;
        this._picker = new Picker(this.app, width, height);
        // Create bound handlers but don't attach them yet
        this._pointerHandlers.pointermove = this._onPointerMove.bind(this);
        this._pointerHandlers.pointerdown = this._onPointerDown.bind(this);
        this._pointerHandlers.pointerup = this._onPointerUp.bind(this);
        // Listen for pointer listeners being added/removed
        ['pointermove', 'pointerdown', 'pointerup', 'pointerenter', 'pointerleave'].forEach((type) => {
            this.addEventListener(`${type}:connect`, () => this._onPointerListenerAdded(type));
            this.addEventListener(`${type}:disconnect`, () => this._onPointerListenerRemoved(type));
        });
    }
    _pickerDestroy() {
        if (this._canvas) {
            Object.entries(this._pointerHandlers).forEach(([type, handler]) => {
                if (handler) {
                    this._canvas.removeEventListener(type, handler);
                }
            });
        }
        this._picker = null;
        this._pointerHandlers = {
            pointermove: null,
            pointerdown: null,
            pointerup: null
        };
    }
    // New helper to convert CSS coordinates to canvas (picker) coordinates
    _getPickerCoordinates(event) {
        // Get the canvas' bounding rectangle in CSS pixels.
        const canvasRect = this._canvas.getBoundingClientRect();
        // Compute scale factors based on canvas actual resolution vs. its CSS display size.
        const scaleX = this._canvas.width / canvasRect.width;
        const scaleY = this._canvas.height / canvasRect.height;
        // Convert the client coordinates accordingly.
        const x = (event.clientX - canvasRect.left) * scaleX;
        const y = (event.clientY - canvasRect.top) * scaleY;
        return { x, y };
    }
    _onPointerMove(event) {
        if (!this._picker || !this.app)
            return;
        const camera = this.app.root.findComponent('camera');
        if (!camera)
            return;
        // Use the helper to convert event coordinates into canvas/picker coordinates.
        const { x, y } = this._getPickerCoordinates(event);
        this._picker.prepare(camera, this.app.scene);
        const selection = this._picker.getSelection(x, y);
        // Get the currently hovered entity by walking up the hierarchy
        let newHoverEntity = null;
        if (selection.length > 0) {
            let currentNode = selection[0].node;
            while (currentNode !== null) {
                const entityElement = this.querySelector(`pc-entity[name="${currentNode.name}"]`);
                if (entityElement) {
                    newHoverEntity = entityElement;
                    break;
                }
                currentNode = currentNode.parent;
            }
        }
        // Handle enter/leave events
        if (this._hoveredEntity !== newHoverEntity) {
            if (this._hoveredEntity && this._hoveredEntity.hasListeners('pointerleave')) {
                this._hoveredEntity.dispatchEvent(new PointerEvent('pointerleave', event));
            }
            if (newHoverEntity && newHoverEntity.hasListeners('pointerenter')) {
                newHoverEntity.dispatchEvent(new PointerEvent('pointerenter', event));
            }
        }
        // Update hover state
        this._hoveredEntity = newHoverEntity;
        // Handle pointermove event
        if (newHoverEntity && newHoverEntity.hasListeners('pointermove')) {
            newHoverEntity.dispatchEvent(new PointerEvent('pointermove', event));
        }
    }
    _onPointerDown(event) {
        if (!this._picker || !this.app)
            return;
        const camera = this.app.root.findComponent('camera');
        if (!camera)
            return;
        // Convert the event's pointer coordinates
        const { x, y } = this._getPickerCoordinates(event);
        this._picker.prepare(camera, this.app.scene);
        const selection = this._picker.getSelection(x, y);
        if (selection.length > 0) {
            let currentNode = selection[0].node;
            while (currentNode !== null) {
                const entityElement = this.querySelector(`pc-entity[name="${currentNode.name}"]`);
                if (entityElement && entityElement.hasListeners('pointerdown')) {
                    entityElement.dispatchEvent(new PointerEvent('pointerdown', event));
                    break;
                }
                currentNode = currentNode.parent;
            }
        }
    }
    _onPointerUp(event) {
        if (!this._picker || !this.app)
            return;
        const camera = this.app.root.findComponent('camera');
        if (!camera)
            return;
        // Convert CSS coordinates to picker coordinates
        const { x, y } = this._getPickerCoordinates(event);
        this._picker.prepare(camera, this.app.scene);
        const selection = this._picker.getSelection(x, y);
        if (selection.length > 0) {
            const entityElement = this.querySelector(`pc-entity[name="${selection[0].node.name}"]`);
            if (entityElement && entityElement.hasListeners('pointerup')) {
                entityElement.dispatchEvent(new PointerEvent('pointerup', event));
            }
        }
    }
    _onPointerListenerAdded(type) {
        if (!this._hasPointerListeners[type] && this._canvas) {
            this._hasPointerListeners[type] = true;
            // For enter/leave events, we need the move handler
            const handler = (type === 'pointerenter' || type === 'pointerleave') ?
                this._pointerHandlers.pointermove :
                this._pointerHandlers[type];
            if (handler) {
                this._canvas.addEventListener(type === 'pointerenter' || type === 'pointerleave' ? 'pointermove' : type, handler);
            }
        }
    }
    _onPointerListenerRemoved(type) {
        const hasListeners = Array.from(this.querySelectorAll('pc-entity'))
            .some(entity => entity.hasListeners(type));
        if (!hasListeners && this._canvas) {
            this._hasPointerListeners[type] = false;
            const handler = (type === 'pointerenter' || type === 'pointerleave') ?
                this._pointerHandlers.pointermove :
                this._pointerHandlers[type];
            if (handler) {
                this._canvas.removeEventListener(type === 'pointerenter' || type === 'pointerleave' ? 'pointermove' : type, handler);
            }
        }
    }
    /**
     * Sets the alpha flag.
     * @param value - The alpha flag.
     */
    set alpha(value) {
        this._alpha = value;
    }
    /**
     * Gets the alpha flag.
     * @returns The alpha flag.
     */
    get alpha() {
        return this._alpha;
    }
    /**
     * Sets the antialias flag.
     * @param value - The antialias flag.
     */
    set antialias(value) {
        this._antialias = value;
    }
    /**
     * Gets the antialias flag.
     * @returns The antialias flag.
     */
    get antialias() {
        return this._antialias;
    }
    /**
     * Sets the depth flag.
     * @param value - The depth flag.
     */
    set depth(value) {
        this._depth = value;
    }
    /**
     * Gets the depth flag.
     * @returns The depth flag.
     */
    get depth() {
        return this._depth;
    }
    /**
     * Gets the hierarchy ready flag.
     * @returns The hierarchy ready flag.
     * @ignore
     */
    get hierarchyReady() {
        return this._hierarchyReady;
    }
    /**
     * Sets the high resolution flag. When true, the application will render at the device's
     * physical resolution. When false, the application will render at CSS resolution.
     * @param value - The high resolution flag.
     */
    set highResolution(value) {
        this._highResolution = value;
        if (this.app) {
            this.app.graphicsDevice.maxPixelRatio = value ? window.devicePixelRatio : 1;
        }
    }
    /**
     * Gets the high resolution flag.
     * @returns The high resolution flag.
     */
    get highResolution() {
        return this._highResolution;
    }
    /**
     * Sets the stencil flag.
     * @param value - The stencil flag.
     */
    set stencil(value) {
        this._stencil = value;
    }
    /**
     * Gets the stencil flag.
     * @returns The stencil flag.
     */
    get stencil() {
        return this._stencil;
    }
    static get observedAttributes() {
        return ['alpha', 'antialias', 'depth', 'stencil', 'high-resolution'];
    }
    attributeChangedCallback(name, _oldValue, newValue) {
        switch (name) {
            case 'alpha':
                this.alpha = newValue !== 'false';
                break;
            case 'antialias':
                this.antialias = newValue !== 'false';
                break;
            case 'depth':
                this.depth = newValue !== 'false';
                break;
            case 'high-resolution':
                this.highResolution = newValue !== 'false';
                break;
            case 'stencil':
                this.stencil = newValue !== 'false';
                break;
        }
    }
}
customElements.define('pc-app', AppElement);

const CSS_COLORS = {
    aliceblue: '#f0f8ff',
    antiquewhite: '#faebd7',
    aqua: '#00ffff',
    aquamarine: '#7fffd4',
    azure: '#f0ffff',
    beige: '#f5f5dc',
    bisque: '#ffe4c4',
    black: '#000000',
    blanchedalmond: '#ffebcd',
    blue: '#0000ff',
    blueviolet: '#8a2be2',
    brown: '#a52a2a',
    burlywood: '#deb887',
    cadetblue: '#5f9ea0',
    chartreuse: '#7fff00',
    chocolate: '#d2691e',
    coral: '#ff7f50',
    cornflowerblue: '#6495ed',
    cornsilk: '#fff8dc',
    crimson: '#dc143c',
    cyan: '#00ffff',
    darkblue: '#00008b',
    darkcyan: '#008b8b',
    darkgoldenrod: '#b8860b',
    darkgray: '#a9a9a9',
    darkgreen: '#006400',
    darkgrey: '#a9a9a9',
    darkkhaki: '#bdb76b',
    darkmagenta: '#8b008b',
    darkolivegreen: '#556b2f',
    darkorange: '#ff8c00',
    darkorchid: '#9932cc',
    darkred: '#8b0000',
    darksalmon: '#e9967a',
    darkseagreen: '#8fbc8f',
    darkslateblue: '#483d8b',
    darkslategray: '#2f4f4f',
    darkslategrey: '#2f4f4f',
    darkturquoise: '#00ced1',
    darkviolet: '#9400d3',
    deeppink: '#ff1493',
    deepskyblue: '#00bfff',
    dimgray: '#696969',
    dimgrey: '#696969',
    dodgerblue: '#1e90ff',
    firebrick: '#b22222',
    floralwhite: '#fffaf0',
    forestgreen: '#228b22',
    fuchsia: '#ff00ff',
    gainsboro: '#dcdcdc',
    ghostwhite: '#f8f8ff',
    gold: '#ffd700',
    goldenrod: '#daa520',
    gray: '#808080',
    green: '#008000',
    greenyellow: '#adff2f',
    grey: '#808080',
    honeydew: '#f0fff0',
    hotpink: '#ff69b4',
    indianred: '#cd5c5c',
    indigo: '#4b0082',
    ivory: '#fffff0',
    khaki: '#f0e68c',
    lavender: '#e6e6fa',
    lavenderblush: '#fff0f5',
    lawngreen: '#7cfc00',
    lemonchiffon: '#fffacd',
    lightblue: '#add8e6',
    lightcoral: '#f08080',
    lightcyan: '#e0ffff',
    lightgoldenrodyellow: '#fafad2',
    lightgray: '#d3d3d3',
    lightgreen: '#90ee90',
    lightgrey: '#d3d3d3',
    lightpink: '#ffb6c1',
    lightsalmon: '#ffa07a',
    lightseagreen: '#20b2aa',
    lightskyblue: '#87cefa',
    lightslategray: '#778899',
    lightslategrey: '#778899',
    lightsteelblue: '#b0c4de',
    lightyellow: '#ffffe0',
    lime: '#00ff00',
    limegreen: '#32cd32',
    linen: '#faf0e6',
    magenta: '#ff00ff',
    maroon: '#800000',
    mediumaquamarine: '#66cdaa',
    mediumblue: '#0000cd',
    mediumorchid: '#ba55d3',
    mediumpurple: '#9370db',
    mediumseagreen: '#3cb371',
    mediumslateblue: '#7b68ee',
    mediumspringgreen: '#00fa9a',
    mediumturquoise: '#48d1cc',
    mediumvioletred: '#c71585',
    midnightblue: '#191970',
    mintcream: '#f5fffa',
    mistyrose: '#ffe4e1',
    moccasin: '#ffe4b5',
    navajowhite: '#ffdead',
    navy: '#000080',
    oldlace: '#fdf5e6',
    olive: '#808000',
    olivedrab: '#6b8e23',
    orange: '#ffa500',
    orangered: '#ff4500',
    orchid: '#da70d6',
    palegoldenrod: '#eee8aa',
    palegreen: '#98fb98',
    paleturquoise: '#afeeee',
    palevioletred: '#db7093',
    papayawhip: '#ffefd5',
    peachpuff: '#ffdab9',
    peru: '#cd853f',
    pink: '#ffc0cb',
    plum: '#dda0dd',
    powderblue: '#b0e0e6',
    purple: '#800080',
    rebeccapurple: '#663399',
    red: '#ff0000',
    rosybrown: '#bc8f8f',
    royalblue: '#4169e1',
    saddlebrown: '#8b4513',
    salmon: '#fa8072',
    sandybrown: '#f4a460',
    seagreen: '#2e8b57',
    seashell: '#fff5ee',
    sienna: '#a0522d',
    silver: '#c0c0c0',
    skyblue: '#87ceeb',
    slateblue: '#6a5acd',
    slategray: '#708090',
    slategrey: '#708090',
    snow: '#fffafa',
    springgreen: '#00ff7f',
    steelblue: '#4682b4',
    tan: '#d2b48c',
    teal: '#008080',
    thistle: '#d8bfd8',
    tomato: '#ff6347',
    turquoise: '#40e0d0',
    violet: '#ee82ee',
    wheat: '#f5deb3',
    white: '#ffffff',
    whitesmoke: '#f5f5f5',
    yellow: '#ffff00',
    yellowgreen: '#9acd32'
};

/**
 * Parse a color string into a Color object. String can be in the format of '#rgb', '#rgba',
 * '#rrggbb', '#rrggbbaa', or a string of 3 or 4 comma-delimited numbers.
 *
 * @param value - The color string to parse.
 * @returns The parsed Color object.
 */
const parseColor = (value) => {
    // Check if it's a CSS color name first
    const hexColor = CSS_COLORS[value.toLowerCase()];
    if (hexColor) {
        return new Color().fromString(hexColor);
    }
    if (value.startsWith('#')) {
        return new Color().fromString(value);
    }
    const components = value.split(' ').map(Number);
    return new Color(components);
};
/**
 * Parse an Euler angles string into a Quat object. String can be in the format of 'x,y,z'.
 *
 * @param value - The Euler angles string to parse.
 * @returns The parsed Quat object.
 */
const parseQuat = (value) => {
    const [x, y, z] = value.split(' ').map(Number);
    const q = new Quat();
    q.setFromEulerAngles(x, y, z);
    return q;
};
/**
 * Parse a Vec2 string into a Vec2 object. String can be in the format of 'x,y'.
 *
 * @param value - The Vec2 string to parse.
 * @returns The parsed Vec2 object.
 */
const parseVec2 = (value) => {
    const components = value.split(' ').map(Number);
    return new Vec2(components);
};
/**
 * Parse a Vec3 string into a Vec3 object. String can be in the format of 'x,y,z'.
 *
 * @param value - The Vec3 string to parse.
 * @returns The parsed Vec3 object.
 */
const parseVec3 = (value) => {
    const components = value.split(' ').map(Number);
    return new Vec3(components);
};
/**
 * Parse a Vec4 string into a Vec4 object. String can be in the format of 'x,y,z,w'.
 *
 * @param value - The Vec4 string to parse.
 * @returns The parsed Vec4 object.
 */
const parseVec4 = (value) => {
    const components = value.split(' ').map(Number);
    return new Vec4(components);
};

/**
 * The EntityElement interface provides properties and methods for manipulating
 * {@link https://developer.playcanvas.com/user-manual/engine/web-components/tags/pc-entity/ | `<pc-entity>`} elements.
 * The EntityElement interface also inherits the properties and methods of the
 * {@link HTMLElement} interface.
 */
class EntityElement extends AsyncElement {
    constructor() {
        super(...arguments);
        /**
         * Whether the entity is enabled.
         */
        this._enabled = true;
        /**
         * The name of the entity.
         */
        this._name = 'Untitled';
        /**
         * The position of the entity.
         */
        this._position = new Vec3();
        /**
         * The rotation of the entity.
         */
        this._rotation = new Vec3();
        /**
         * The scale of the entity.
         */
        this._scale = new Vec3(1, 1, 1);
        /**
         * The tags of the entity.
         */
        this._tags = [];
        /**
         * The pointer event listeners for the entity.
         */
        this._listeners = {};
        /**
         * The PlayCanvas entity instance.
         */
        this.entity = null;
    }
    createEntity(app) {
        // Create a new entity
        this.entity = new Entity(this.getAttribute('name') || this._name, app);
        const enabled = this.getAttribute('enabled');
        if (enabled) {
            this.entity.enabled = enabled !== 'false';
        }
        const position = this.getAttribute('position');
        if (position) {
            this.entity.setLocalPosition(parseVec3(position));
        }
        const rotation = this.getAttribute('rotation');
        if (rotation) {
            this.entity.setLocalEulerAngles(parseVec3(rotation));
        }
        const scale = this.getAttribute('scale');
        if (scale) {
            this.entity.setLocalScale(parseVec3(scale));
        }
        const tags = this.getAttribute('tags');
        if (tags) {
            this.entity.tags.add(tags.split(',').map(tag => tag.trim()));
        }
        // Handle pointer events
        const pointerEvents = [
            'onpointerenter',
            'onpointerleave',
            'onpointerdown',
            'onpointerup',
            'onpointermove'
        ];
        pointerEvents.forEach((eventName) => {
            const handler = this.getAttribute(eventName);
            if (handler) {
                const eventType = eventName.substring(2); // remove 'on' prefix
                const eventHandler = (event) => {
                    try {
                        /* eslint-disable-next-line no-new-func */
                        new Function('event', handler).call(this, event);
                    }
                    catch (e) {
                        console.error('Error in event handler:', e);
                    }
                };
                this.addEventListener(eventType, eventHandler);
            }
        });
    }
    buildHierarchy(app) {
        if (!this.entity)
            return;
        const closestEntity = this.closestEntity;
        if (closestEntity === null || closestEntity === void 0 ? void 0 : closestEntity.entity) {
            closestEntity.entity.addChild(this.entity);
        }
        else {
            app.root.addChild(this.entity);
        }
        this._onReady();
    }
    connectedCallback() {
        // Wait for app to be ready
        const closestApp = this.closestApp;
        if (!closestApp)
            return;
        // If app is already running, create entity immediately
        if (closestApp.hierarchyReady) {
            const app = closestApp.app;
            this.createEntity(app);
            this.buildHierarchy(app);
            // Handle any child entities that might exist
            const childEntities = this.querySelectorAll('pc-entity');
            childEntities.forEach((child) => {
                child.createEntity(app);
            });
            childEntities.forEach((child) => {
                child.buildHierarchy(app);
            });
        }
    }
    disconnectedCallback() {
        if (this.entity) {
            // Notify all children that their entities are about to become invalid
            const children = this.querySelectorAll('pc-entity');
            children.forEach((child) => {
                child.entity = null;
            });
            // Destroy the entity
            this.entity.destroy();
            this.entity = null;
        }
    }
    /**
     * Sets the enabled state of the entity.
     * @param value - Whether the entity is enabled.
     */
    set enabled(value) {
        this._enabled = value;
        if (this.entity) {
            this.entity.enabled = value;
        }
    }
    /**
     * Gets the enabled state of the entity.
     * @returns Whether the entity is enabled.
     */
    get enabled() {
        return this._enabled;
    }
    /**
     * Sets the name of the entity.
     * @param value - The name of the entity.
     */
    set name(value) {
        this._name = value;
        if (this.entity) {
            this.entity.name = value;
        }
    }
    /**
     * Gets the name of the entity.
     * @returns The name of the entity.
     */
    get name() {
        return this._name;
    }
    /**
     * Sets the position of the entity.
     * @param value - The position of the entity.
     */
    set position(value) {
        this._position = value;
        if (this.entity) {
            this.entity.setLocalPosition(this._position);
        }
    }
    /**
     * Gets the position of the entity.
     * @returns The position of the entity.
     */
    get position() {
        return this._position;
    }
    /**
     * Sets the rotation of the entity.
     * @param value - The rotation of the entity.
     */
    set rotation(value) {
        this._rotation = value;
        if (this.entity) {
            this.entity.setLocalEulerAngles(this._rotation);
        }
    }
    /**
     * Gets the rotation of the entity.
     * @returns The rotation of the entity.
     */
    get rotation() {
        return this._rotation;
    }
    /**
     * Sets the scale of the entity.
     * @param value - The scale of the entity.
     */
    set scale(value) {
        this._scale = value;
        if (this.entity) {
            this.entity.setLocalScale(this._scale);
        }
    }
    /**
     * Gets the scale of the entity.
     * @returns The scale of the entity.
     */
    get scale() {
        return this._scale;
    }
    /**
     * Sets the tags of the entity.
     * @param value - The tags of the entity.
     */
    set tags(value) {
        this._tags = value;
        if (this.entity) {
            this.entity.tags.clear();
            this.entity.tags.add(this._tags);
        }
    }
    /**
     * Gets the tags of the entity.
     * @returns The tags of the entity.
     */
    get tags() {
        return this._tags;
    }
    static get observedAttributes() {
        return [
            'enabled',
            'name',
            'position',
            'rotation',
            'scale',
            'tags',
            'onpointerenter',
            'onpointerleave',
            'onpointerdown',
            'onpointerup',
            'onpointermove'
        ];
    }
    attributeChangedCallback(name, _oldValue, newValue) {
        switch (name) {
            case 'enabled':
                this.enabled = newValue !== 'false';
                break;
            case 'name':
                this.name = newValue;
                break;
            case 'position':
                this.position = parseVec3(newValue);
                break;
            case 'rotation':
                this.rotation = parseVec3(newValue);
                break;
            case 'scale':
                this.scale = parseVec3(newValue);
                break;
            case 'tags':
                this.tags = newValue.split(',').map(tag => tag.trim());
                break;
            case 'onpointerenter':
            case 'onpointerleave':
            case 'onpointerdown':
            case 'onpointerup':
            case 'onpointermove':
                if (newValue) {
                    const eventName = name.substring(2);
                    // Use Function.prototype.bind to avoid new Function
                    const handler = (event) => {
                        try {
                            const handlerStr = this.getAttribute(eventName) || '';
                            /* eslint-disable-next-line no-new-func */
                            new Function('event', handlerStr).call(this, event);
                        }
                        catch (e) {
                            console.error('Error in event handler:', e);
                        }
                    };
                    this.addEventListener(eventName, handler);
                }
                break;
        }
    }
    addEventListener(type, listener, options) {
        if (!this._listeners[type]) {
            this._listeners[type] = [];
        }
        this._listeners[type].push(listener);
        super.addEventListener(type, listener, options);
        if (type.startsWith('pointer')) {
            this.dispatchEvent(new CustomEvent(`${type}:connect`, { bubbles: true }));
        }
    }
    removeEventListener(type, listener, options) {
        if (this._listeners[type]) {
            this._listeners[type] = this._listeners[type].filter(l => l !== listener);
        }
        super.removeEventListener(type, listener, options);
        if (type.startsWith('pointer')) {
            this.dispatchEvent(new CustomEvent(`${type}:disconnect`, { bubbles: true }));
        }
    }
    hasListeners(type) {
        var _a;
        return Boolean((_a = this._listeners[type]) === null || _a === void 0 ? void 0 : _a.length);
    }
}
customElements.define('pc-entity', EntityElement);

// This file is part of meshoptimizer library and is distributed under the terms of MIT License.
// Copyright (C) 2016-2022, by Arseny Kapoulkine (arseny.kapoulkine@gmail.com)
var MeshoptDecoder = (function() {

	// Built with clang version 14.0.4
	// Built from meshoptimizer 0.18
	var wasm_base = "b9H79Tebbbe8Fv9Gbb9Gvuuuuueu9Giuuub9Geueu9Giuuueuikqbeeedddillviebeoweuec:q;iekr;leDo9TW9T9VV95dbH9F9F939H79T9F9J9H229F9Jt9VV7bb8A9TW79O9V9Wt9F9KW9J9V9KW9wWVtW949c919M9MWVbeY9TW79O9V9Wt9F9KW9J9V9KW69U9KW949c919M9MWVbdE9TW79O9V9Wt9F9KW9J9V9KW69U9KW949tWG91W9U9JWbiL9TW79O9V9Wt9F9KW9J9V9KWS9P2tWV9p9JtblK9TW79O9V9Wt9F9KW9J9V9KWS9P2tWV9r919HtbvL9TW79O9V9Wt9F9KW9J9V9KWS9P2tWVT949Wbol79IV9Rbrq:P8Yqdbk;3sezu8Jjjjjbcj;eb9Rgv8Kjjjjbc9:hodnadcefal0mbcuhoaiRbbc:Ge9hmbavaialfgrad9Radz1jjjbhwcj;abad9UhoaicefhldnadTmbaoc;WFbGgocjdaocjd6EhDcbhqinaqae9pmeaDaeaq9RaqaDfae6Egkcsfgocl4cifcd4hxdndndndnaoc9WGgmTmbcbhPcehsawcjdfhzalhHinaraH9Rax6midnaraHaxfgl9RcK6mbczhoinawcj;cbfaogifgoc9WfhOdndndndndnaHaic9WfgAco4fRbbaAci4coG4ciGPlbedibkaO9cb83ibaOcwf9cb83ibxikaOalRblalRbbgAco4gCaCciSgCE86bbaocGfalclfaCfgORbbaAcl4ciGgCaCciSgCE86bbaocVfaOaCfgORbbaAcd4ciGgCaCciSgCE86bbaoc7faOaCfgORbbaAciGgAaAciSgAE86bbaoctfaOaAfgARbbalRbegOco4gCaCciSgCE86bbaoc91faAaCfgARbbaOcl4ciGgCaCciSgCE86bbaoc4faAaCfgARbbaOcd4ciGgCaCciSgCE86bbaoc93faAaCfgARbbaOciGgOaOciSgOE86bbaoc94faAaOfgARbbalRbdgOco4gCaCciSgCE86bbaoc95faAaCfgARbbaOcl4ciGgCaCciSgCE86bbaoc96faAaCfgARbbaOcd4ciGgCaCciSgCE86bbaoc97faAaCfgARbbaOciGgOaOciSgOE86bbaoc98faAaOfgORbbalRbiglco4gAaAciSgAE86bbaoc99faOaAfgORbbalcl4ciGgAaAciSgAE86bbaoc9:faOaAfgORbbalcd4ciGgAaAciSgAE86bbaocufaOaAfgoRbbalciGglalciSglE86bbaoalfhlxdkaOalRbwalRbbgAcl4gCaCcsSgCE86bbaocGfalcwfaCfgORbbaAcsGgAaAcsSgAE86bbaocVfaOaAfgORbbalRbegAcl4gCaCcsSgCE86bbaoc7faOaCfgORbbaAcsGgAaAcsSgAE86bbaoctfaOaAfgORbbalRbdgAcl4gCaCcsSgCE86bbaoc91faOaCfgORbbaAcsGgAaAcsSgAE86bbaoc4faOaAfgORbbalRbigAcl4gCaCcsSgCE86bbaoc93faOaCfgORbbaAcsGgAaAcsSgAE86bbaoc94faOaAfgORbbalRblgAcl4gCaCcsSgCE86bbaoc95faOaCfgORbbaAcsGgAaAcsSgAE86bbaoc96faOaAfgORbbalRbvgAcl4gCaCcsSgCE86bbaoc97faOaCfgORbbaAcsGgAaAcsSgAE86bbaoc98faOaAfgORbbalRbogAcl4gCaCcsSgCE86bbaoc99faOaCfgORbbaAcsGgAaAcsSgAE86bbaoc9:faOaAfgORbbalRbrglcl4gAaAcsSgAE86bbaocufaOaAfgoRbbalcsGglalcsSglE86bbaoalfhlxekaOal8Pbb83bbaOcwfalcwf8Pbb83bbalczfhlkdnaiam9pmbaiczfhoaral9RcL0mekkaiam6mialTmidnakTmbawaPfRbbhOcbhoazhiinaiawcj;cbfaofRbbgAce4cbaAceG9R7aOfgO86bbaiadfhiaocefgoak9hmbkkazcefhzaPcefgPad6hsalhHaPad9hmexvkkcbhlasceGmdxikalaxad2fhCdnakTmbcbhHcehsawcjdfhminaral9Rax6mialTmdalaxfhlawaHfRbbhOcbhoamhiinaiawcj;cbfaofRbbgAce4cbaAceG9R7aOfgO86bbaiadfhiaocefgoak9hmbkamcefhmaHcefgHad6hsaHad9hmbkaChlxikcbhocehsinaral9Rax6mdalTmealaxfhlaocefgoad6hsadao9hmbkaChlxdkcbhlasceGTmekc9:hoxikabaqad2fawcjdfakad2z1jjjb8Aawawcjdfakcufad2fadz1jjjb8Aakaqfhqalmbkc9:hoxekcbc99aral9Radcaadca0ESEhokavcj;ebf8Kjjjjbaok;yzeHu8Jjjjjbc;ae9Rgv8Kjjjjbc9:hodnaeci9UgrcHfal0mbcuhoaiRbbgwc;WeGc;Ge9hmbawcsGgDce0mbavc;abfcFecjez:jjjjb8AavcUf9cu83ibavc8Wf9cu83ibavcyf9cu83ibavcaf9cu83ibavcKf9cu83ibavczf9cu83ibav9cu83iwav9cu83ibaialfc9WfhqaicefgwarfhodnaeTmbcmcsaDceSEhkcbhxcbhmcbhDcbhicbhlindnaoaq9nmbc9:hoxikdndnawRbbgrc;Ve0mbavc;abfalarcl4cu7fcsGcitfgPydlhsaPydbhzdnarcsGgPak9pmbavaiarcu7fcsGcdtfydbaxaPEhraPThPdndnadcd9hmbabaDcetfgHaz87ebaHcdfas87ebaHclfar87ebxekabaDcdtfgHazBdbaHclfasBdbaHcwfarBdbkaxaPfhxavc;abfalcitfgHarBdbaHasBdlavaicdtfarBdbavc;abfalcefcsGglcitfgHazBdbaHarBdlaiaPfhialcefhlxdkdndnaPcsSmbamaPfaPc987fcefhmxekaocefhrao8SbbgPcFeGhHdndnaPcu9mmbarhoxekaocvfhoaHcFbGhHcrhPdninar8SbbgOcFbGaPtaHVhHaOcu9kmearcefhraPcrfgPc8J9hmbxdkkarcefhokaHce4cbaHceG9R7amfhmkdndnadcd9hmbabaDcetfgraz87ebarcdfas87ebarclfam87ebxekabaDcdtfgrazBdbarclfasBdbarcwfamBdbkavc;abfalcitfgramBdbarasBdlavaicdtfamBdbavc;abfalcefcsGglcitfgrazBdbaramBdlaicefhialcefhlxekdnarcpe0mbaxcefgOavaiaqarcsGfRbbgPcl49RcsGcdtfydbaPcz6gHEhravaiaP9RcsGcdtfydbaOaHfgsaPcsGgOEhPaOThOdndnadcd9hmbabaDcetfgzax87ebazcdfar87ebazclfaP87ebxekabaDcdtfgzaxBdbazclfarBdbazcwfaPBdbkavaicdtfaxBdbavc;abfalcitfgzarBdbazaxBdlavaicefgicsGcdtfarBdbavc;abfalcefcsGcitfgzaPBdbazarBdlavaiaHfcsGgicdtfaPBdbavc;abfalcdfcsGglcitfgraxBdbaraPBdlalcefhlaiaOfhiasaOfhxxekaxcbaoRbbgzEgAarc;:eSgrfhsazcsGhCazcl4hXdndnazcs0mbascefhOxekashOavaiaX9RcsGcdtfydbhskdndnaCmbaOcefhxxekaOhxavaiaz9RcsGcdtfydbhOkdndnarTmbaocefhrxekaocdfhrao8SbegHcFeGhPdnaHcu9kmbaocofhAaPcFbGhPcrhodninar8SbbgHcFbGaotaPVhPaHcu9kmearcefhraocrfgoc8J9hmbkaAhrxekarcefhrkaPce4cbaPceG9R7amfgmhAkdndnaXcsSmbarhPxekarcefhPar8SbbgocFeGhHdnaocu9kmbarcvfhsaHcFbGhHcrhodninaP8SbbgrcFbGaotaHVhHarcu9kmeaPcefhPaocrfgoc8J9hmbkashPxekaPcefhPkaHce4cbaHceG9R7amfgmhskdndnaCcsSmbaPhoxekaPcefhoaP8SbbgrcFeGhHdnarcu9kmbaPcvfhOaHcFbGhHcrhrdninao8SbbgPcFbGartaHVhHaPcu9kmeaocefhoarcrfgrc8J9hmbkaOhoxekaocefhokaHce4cbaHceG9R7amfgmhOkdndnadcd9hmbabaDcetfgraA87ebarcdfas87ebarclfaO87ebxekabaDcdtfgraABdbarclfasBdbarcwfaOBdbkavc;abfalcitfgrasBdbaraABdlavaicdtfaABdbavc;abfalcefcsGcitfgraOBdbarasBdlavaicefgicsGcdtfasBdbavc;abfalcdfcsGcitfgraABdbaraOBdlavaiazcz6aXcsSVfgicsGcdtfaOBdbaiaCTaCcsSVfhialcifhlkawcefhwalcsGhlaicsGhiaDcifgDae6mbkkcbc99aoaqSEhokavc;aef8Kjjjjbaok:llevu8Jjjjjbcz9Rhvc9:hodnaecvfal0mbcuhoaiRbbc;:eGc;qe9hmbav9cb83iwaicefhraialfc98fhwdnaeTmbdnadcdSmbcbhDindnaraw6mbc9:skarcefhoar8SbbglcFeGhidndnalcu9mmbaohrxekarcvfhraicFbGhicrhldninao8SbbgdcFbGaltaiVhiadcu9kmeaocefhoalcrfglc8J9hmbxdkkaocefhrkabaDcdtfaicd4cbaice4ceG9R7avcwfaiceGcdtVgoydbfglBdbaoalBdbaDcefgDae9hmbxdkkcbhDindnaraw6mbc9:skarcefhoar8SbbglcFeGhidndnalcu9mmbaohrxekarcvfhraicFbGhicrhldninao8SbbgdcFbGaltaiVhiadcu9kmeaocefhoalcrfglc8J9hmbxdkkaocefhrkabaDcetfaicd4cbaice4ceG9R7avcwfaiceGcdtVgoydbfgl87ebaoalBdbaDcefgDae9hmbkkcbc99arawSEhokaok:Lvoeue99dud99eud99dndnadcl9hmbaeTmeindndnabcdfgd8Sbb:Yab8Sbbgi:Ygl:l:tabcefgv8Sbbgo:Ygr:l:tgwJbb;:9cawawNJbbbbawawJbbbb9GgDEgq:mgkaqaicb9iEalMgwawNakaqaocb9iEarMgqaqNMM:r:vglNJbbbZJbbb:;aDEMgr:lJbbb9p9DTmbar:Ohixekcjjjj94hikadai86bbdndnaqalNJbbbZJbbb:;aqJbbbb9GEMgq:lJbbb9p9DTmbaq:Ohdxekcjjjj94hdkavad86bbdndnawalNJbbbZJbbb:;awJbbbb9GEMgw:lJbbb9p9DTmbaw:Ohdxekcjjjj94hdkabad86bbabclfhbaecufgembxdkkaeTmbindndnabclfgd8Ueb:Yab8Uebgi:Ygl:l:tabcdfgv8Uebgo:Ygr:l:tgwJb;:FSawawNJbbbbawawJbbbb9GgDEgq:mgkaqaicb9iEalMgwawNakaqaocb9iEarMgqaqNMM:r:vglNJbbbZJbbb:;aDEMgr:lJbbb9p9DTmbar:Ohixekcjjjj94hikadai87ebdndnaqalNJbbbZJbbb:;aqJbbbb9GEMgq:lJbbb9p9DTmbaq:Ohdxekcjjjj94hdkavad87ebdndnawalNJbbbZJbbb:;awJbbbb9GEMgw:lJbbb9p9DTmbaw:Ohdxekcjjjj94hdkabad87ebabcwfhbaecufgembkkk;siliui99iue99dnaeTmbcbhiabhlindndnJ;Zl81Zalcof8UebgvciV:Y:vgoal8Ueb:YNgrJb;:FSNJbbbZJbbb:;arJbbbb9GEMgw:lJbbb9p9DTmbaw:OhDxekcjjjj94hDkalclf8Uebhqalcdf8UebhkabavcefciGaiVcetfaD87ebdndnaoak:YNgwJb;:FSNJbbbZJbbb:;awJbbbb9GEMgx:lJbbb9p9DTmbax:Ohkxekcjjjj94hkkabavcdfciGaiVcetfak87ebdndnaoaq:YNgoJb;:FSNJbbbZJbbb:;aoJbbbb9GEMgx:lJbbb9p9DTmbax:Ohqxekcjjjj94hqkabavcufciGaiVcetfaq87ebdndnJbbjZararN:tawawN:taoaoN:tgrJbbbbarJbbbb9GE:rJb;:FSNJbbbZMgr:lJbbb9p9DTmbar:Ohqxekcjjjj94hqkabavciGaiVcetfaq87ebalcwfhlaiclfhiaecufgembkkk9mbdnadcd4ae2geTmbinababydbgdcwtcw91:Yadce91cjjj;8ifcjjj98G::NUdbabclfhbaecufgembkkk9teiucbcbydj1jjbgeabcifc98GfgbBdj1jjbdndnabZbcztgd9nmbcuhiabad9RcFFifcz4nbcuSmekaehikaik;LeeeudndnaeabVciGTmbabhixekdndnadcz9pmbabhixekabhiinaiaeydbBdbaiclfaeclfydbBdbaicwfaecwfydbBdbaicxfaecxfydbBdbaiczfhiaeczfheadc9Wfgdcs0mbkkadcl6mbinaiaeydbBdbaeclfheaiclfhiadc98fgdci0mbkkdnadTmbinaiaeRbb86bbaicefhiaecefheadcufgdmbkkabk;aeedudndnabciGTmbabhixekaecFeGc:b:c:ew2hldndnadcz9pmbabhixekabhiinaialBdbaicxfalBdbaicwfalBdbaiclfalBdbaiczfhiadc9Wfgdcs0mbkkadcl6mbinaialBdbaiclfhiadc98fgdci0mbkkdnadTmbinaiae86bbaicefhiadcufgdmbkkabkkkebcjwklz9Kbb";
	var wasm_simd = "b9H79TebbbeKl9Gbb9Gvuuuuueu9Giuuub9Geueuikqbbebeedddilve9Weeeviebeoweuec:q;Aekr;leDo9TW9T9VV95dbH9F9F939H79T9F9J9H229F9Jt9VV7bb8A9TW79O9V9Wt9F9KW9J9V9KW9wWVtW949c919M9MWVbdY9TW79O9V9Wt9F9KW9J9V9KW69U9KW949c919M9MWVblE9TW79O9V9Wt9F9KW9J9V9KW69U9KW949tWG91W9U9JWbvL9TW79O9V9Wt9F9KW9J9V9KWS9P2tWV9p9JtboK9TW79O9V9Wt9F9KW9J9V9KWS9P2tWV9r919HtbrL9TW79O9V9Wt9F9KW9J9V9KWS9P2tWVT949Wbwl79IV9RbDq;t9tqlbzik9:evu8Jjjjjbcz9Rhbcbheincbhdcbhiinabcwfadfaicjuaead4ceGglE86bbaialfhiadcefgdcw9hmbkaec:q:yjjbfai86bbaecitc:q1jjbfab8Piw83ibaecefgecjd9hmbkk;h8JlHud97euo978Jjjjjbcj;kb9Rgv8Kjjjjbc9:hodnadcefal0mbcuhoaiRbbc:Ge9hmbavaialfgrad9Rad;8qbbcj;abad9UhoaicefhldnadTmbaoc;WFbGgocjdaocjd6EhwcbhDinaDae9pmeawaeaD9RaDawfae6Egqcsfgoc9WGgkci2hxakcethmaocl4cifcd4hPabaDad2fhscbhzdnincehHalhOcbhAdninaraO9RaP6miavcj;cbfaAak2fhCaOaPfhlcbhidnakc;ab6mbaral9Rc;Gb6mbcbhoinaCaofhidndndndndnaOaoco4fRbbgXciGPlbedibkaipxbbbbbbbbbbbbbbbbpklbxikaialpbblalpbbbgQclp:meaQpmbzeHdOiAlCvXoQrLgQcdp:meaQpmbzeHdOiAlCvXoQrLpxiiiiiiiiiiiiiiiip9ogLpxiiiiiiiiiiiiiiiip8JgQp5b9cjF;8;4;W;G;ab9:9cU1:NgKcitc:q1jjbfpbibaKc:q:yjjbfpbbbgYaYpmbbbbbbbbbbbbbbbbaQp5e9cjF;8;4;W;G;ab9:9cU1:NgKcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPaLaQp9spklbalclfaYpQbfaKc:q:yjjbfRbbfhlxdkaialpbbwalpbbbgQclp:meaQpmbzeHdOiAlCvXoQrLpxssssssssssssssssp9ogLpxssssssssssssssssp8JgQp5b9cjF;8;4;W;G;ab9:9cU1:NgKcitc:q1jjbfpbibaKc:q:yjjbfpbbbgYaYpmbbbbbbbbbbbbbbbbaQp5e9cjF;8;4;W;G;ab9:9cU1:NgKcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPaLaQp9spklbalcwfaYpQbfaKc:q:yjjbfRbbfhlxekaialpbbbpklbalczfhlkdndndndndnaXcd4ciGPlbedibkaipxbbbbbbbbbbbbbbbbpklzxikaialpbblalpbbbgQclp:meaQpmbzeHdOiAlCvXoQrLgQcdp:meaQpmbzeHdOiAlCvXoQrLpxiiiiiiiiiiiiiiiip9ogLpxiiiiiiiiiiiiiiiip8JgQp5b9cjF;8;4;W;G;ab9:9cU1:NgKcitc:q1jjbfpbibaKc:q:yjjbfpbbbgYaYpmbbbbbbbbbbbbbbbbaQp5e9cjF;8;4;W;G;ab9:9cU1:NgKcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPaLaQp9spklzalclfaYpQbfaKc:q:yjjbfRbbfhlxdkaialpbbwalpbbbgQclp:meaQpmbzeHdOiAlCvXoQrLpxssssssssssssssssp9ogLpxssssssssssssssssp8JgQp5b9cjF;8;4;W;G;ab9:9cU1:NgKcitc:q1jjbfpbibaKc:q:yjjbfpbbbgYaYpmbbbbbbbbbbbbbbbbaQp5e9cjF;8;4;W;G;ab9:9cU1:NgKcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPaLaQp9spklzalcwfaYpQbfaKc:q:yjjbfRbbfhlxekaialpbbbpklzalczfhlkdndndndndnaXcl4ciGPlbedibkaipxbbbbbbbbbbbbbbbbpklaxikaialpbblalpbbbgQclp:meaQpmbzeHdOiAlCvXoQrLgQcdp:meaQpmbzeHdOiAlCvXoQrLpxiiiiiiiiiiiiiiiip9ogLpxiiiiiiiiiiiiiiiip8JgQp5b9cjF;8;4;W;G;ab9:9cU1:NgKcitc:q1jjbfpbibaKc:q:yjjbfpbbbgYaYpmbbbbbbbbbbbbbbbbaQp5e9cjF;8;4;W;G;ab9:9cU1:NgKcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPaLaQp9spklaalclfaYpQbfaKc:q:yjjbfRbbfhlxdkaialpbbwalpbbbgQclp:meaQpmbzeHdOiAlCvXoQrLpxssssssssssssssssp9ogLpxssssssssssssssssp8JgQp5b9cjF;8;4;W;G;ab9:9cU1:NgKcitc:q1jjbfpbibaKc:q:yjjbfpbbbgYaYpmbbbbbbbbbbbbbbbbaQp5e9cjF;8;4;W;G;ab9:9cU1:NgKcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPaLaQp9spklaalcwfaYpQbfaKc:q:yjjbfRbbfhlxekaialpbbbpklaalczfhlkdndndndndnaXco4Plbedibkaipxbbbbbbbbbbbbbbbbpkl8WxikaialpbblalpbbbgQclp:meaQpmbzeHdOiAlCvXoQrLgQcdp:meaQpmbzeHdOiAlCvXoQrLpxiiiiiiiiiiiiiiiip9ogLpxiiiiiiiiiiiiiiiip8JgQp5b9cjF;8;4;W;G;ab9:9cU1:NgXcitc:q1jjbfpbibaXc:q:yjjbfpbbbgYaYpmbbbbbbbbbbbbbbbbaQp5e9cjF;8;4;W;G;ab9:9cU1:NgXcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPaLaQp9spkl8WalclfaYpQbfaXc:q:yjjbfRbbfhlxdkaialpbbwalpbbbgQclp:meaQpmbzeHdOiAlCvXoQrLpxssssssssssssssssp9ogLpxssssssssssssssssp8JgQp5b9cjF;8;4;W;G;ab9:9cU1:NgXcitc:q1jjbfpbibaXc:q:yjjbfpbbbgYaYpmbbbbbbbbbbbbbbbbaQp5e9cjF;8;4;W;G;ab9:9cU1:NgXcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPaLaQp9spkl8WalcwfaYpQbfaXc:q:yjjbfRbbfhlxekaialpbbbpkl8Walczfhlkaoc;abfhiaocjefak0meaihoaral9Rc;Fb0mbkkdndnaiak9pmbaici4hoinaral9RcK6mdaCaifhXdndndndndnaOaico4fRbbaocoG4ciGPlbedibkaXpxbbbbbbbbbbbbbbbbpklbxikaXalpbblalpbbbgQclp:meaQpmbzeHdOiAlCvXoQrLgQcdp:meaQpmbzeHdOiAlCvXoQrLpxiiiiiiiiiiiiiiiip9ogLpxiiiiiiiiiiiiiiiip8JgQp5b9cjF;8;4;W;G;ab9:9cU1:NgKcitc:q1jjbfpbibaKc:q:yjjbfpbbbgYaYpmbbbbbbbbbbbbbbbbaQp5e9cjF;8;4;W;G;ab9:9cU1:NgKcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPaLaQp9spklbalclfaYpQbfaKc:q:yjjbfRbbfhlxdkaXalpbbwalpbbbgQclp:meaQpmbzeHdOiAlCvXoQrLpxssssssssssssssssp9ogLpxssssssssssssssssp8JgQp5b9cjF;8;4;W;G;ab9:9cU1:NgKcitc:q1jjbfpbibaKc:q:yjjbfpbbbgYaYpmbbbbbbbbbbbbbbbbaQp5e9cjF;8;4;W;G;ab9:9cU1:NgKcitc:q1jjbfpbibp9UpmbedilvorzHOACXQLpPaLaQp9spklbalcwfaYpQbfaKc:q:yjjbfRbbfhlxekaXalpbbbpklbalczfhlkaocdfhoaiczfgiak6mbkkalTmbaAci6hHalhOaAcefgohAaoclSmdxekkcbhlaHceGmdkdnakTmbavcjdfazfhiavazfpbdbhYcbhXinaiavcj;cbfaXfgopblbgLcep9TaLpxeeeeeeeeeeeeeeeegQp9op9Hp9rgLaoakfpblbg8Acep9Ta8AaQp9op9Hp9rg8ApmbzeHdOiAlCvXoQrLgEaoamfpblbg3cep9Ta3aQp9op9Hp9rg3aoaxfpblbg5cep9Ta5aQp9op9Hp9rg5pmbzeHdOiAlCvXoQrLg8EpmbezHdiOAlvCXorQLgQaQpmbedibedibedibediaYp9UgYp9AdbbaiadfgoaYaQaQpmlvorlvorlvorlvorp9UgYp9AdbbaoadfgoaYaQaQpmwDqkwDqkwDqkwDqkp9UgYp9AdbbaoadfgoaYaQaQpmxmPsxmPsxmPsxmPsp9UgYp9AdbbaoadfgoaYaEa8EpmwDKYqk8AExm35Ps8E8FgQaQpmbedibedibedibedip9UgYp9AdbbaoadfgoaYaQaQpmlvorlvorlvorlvorp9UgYp9AdbbaoadfgoaYaQaQpmwDqkwDqkwDqkwDqkp9UgYp9AdbbaoadfgoaYaQaQpmxmPsxmPsxmPsxmPsp9UgYp9AdbbaoadfgoaYaLa8ApmwKDYq8AkEx3m5P8Es8FgLa3a5pmwKDYq8AkEx3m5P8Es8Fg8ApmbezHdiOAlvCXorQLgQaQpmbedibedibedibedip9UgYp9AdbbaoadfgoaYaQaQpmlvorlvorlvorlvorp9UgYp9AdbbaoadfgoaYaQaQpmwDqkwDqkwDqkwDqkp9UgYp9AdbbaoadfgoaYaQaQpmxmPsxmPsxmPsxmPsp9UgYp9AdbbaoadfgoaYaLa8ApmwDKYqk8AExm35Ps8E8FgQaQpmbedibedibedibedip9UgYp9AdbbaoadfgoaYaQaQpmlvorlvorlvorlvorp9UgYp9AdbbaoadfgoaYaQaQpmwDqkwDqkwDqkwDqkp9UgYp9AdbbaoadfgoaYaQaQpmxmPsxmPsxmPsxmPsp9UgYp9AdbbaoadfhiaXczfgXak6mbkkazclfgzad6mbkasavcjdfaqad2;8qbbavavcjdfaqcufad2fad;8qbbaqaDfhDc9:hoalmexikkc9:hoxekcbc99aral9Radcaadca0ESEhokavcj;kbf8Kjjjjbaokwbz:bjjjbk;uzeHu8Jjjjjbc;ae9Rgv8Kjjjjbc9:hodnaeci9UgrcHfal0mbcuhoaiRbbgwc;WeGc;Ge9hmbawcsGgDce0mbavc;abfcFecje;8kbavcUf9cu83ibavc8Wf9cu83ibavcyf9cu83ibavcaf9cu83ibavcKf9cu83ibavczf9cu83ibav9cu83iwav9cu83ibaialfc9WfhqaicefgwarfhodnaeTmbcmcsaDceSEhkcbhxcbhmcbhDcbhicbhlindnaoaq9nmbc9:hoxikdndnawRbbgrc;Ve0mbavc;abfalarcl4cu7fcsGcitfgPydlhsaPydbhzdnarcsGgPak9pmbavaiarcu7fcsGcdtfydbaxaPEhraPThPdndnadcd9hmbabaDcetfgHaz87ebaHcdfas87ebaHclfar87ebxekabaDcdtfgHazBdbaHclfasBdbaHcwfarBdbkaxaPfhxavc;abfalcitfgHarBdbaHasBdlavaicdtfarBdbavc;abfalcefcsGglcitfgHazBdbaHarBdlaiaPfhialcefhlxdkdndnaPcsSmbamaPfaPc987fcefhmxekaocefhrao8SbbgPcFeGhHdndnaPcu9mmbarhoxekaocvfhoaHcFbGhHcrhPdninar8SbbgOcFbGaPtaHVhHaOcu9kmearcefhraPcrfgPc8J9hmbxdkkarcefhokaHce4cbaHceG9R7amfhmkdndnadcd9hmbabaDcetfgraz87ebarcdfas87ebarclfam87ebxekabaDcdtfgrazBdbarclfasBdbarcwfamBdbkavc;abfalcitfgramBdbarasBdlavaicdtfamBdbavc;abfalcefcsGglcitfgrazBdbaramBdlaicefhialcefhlxekdnarcpe0mbaxcefgOavaiaqarcsGfRbbgPcl49RcsGcdtfydbaPcz6gHEhravaiaP9RcsGcdtfydbaOaHfgsaPcsGgOEhPaOThOdndnadcd9hmbabaDcetfgzax87ebazcdfar87ebazclfaP87ebxekabaDcdtfgzaxBdbazclfarBdbazcwfaPBdbkavaicdtfaxBdbavc;abfalcitfgzarBdbazaxBdlavaicefgicsGcdtfarBdbavc;abfalcefcsGcitfgzaPBdbazarBdlavaiaHfcsGgicdtfaPBdbavc;abfalcdfcsGglcitfgraxBdbaraPBdlalcefhlaiaOfhiasaOfhxxekaxcbaoRbbgzEgAarc;:eSgrfhsazcsGhCazcl4hXdndnazcs0mbascefhOxekashOavaiaX9RcsGcdtfydbhskdndnaCmbaOcefhxxekaOhxavaiaz9RcsGcdtfydbhOkdndnarTmbaocefhrxekaocdfhrao8SbegHcFeGhPdnaHcu9kmbaocofhAaPcFbGhPcrhodninar8SbbgHcFbGaotaPVhPaHcu9kmearcefhraocrfgoc8J9hmbkaAhrxekarcefhrkaPce4cbaPceG9R7amfgmhAkdndnaXcsSmbarhPxekarcefhPar8SbbgocFeGhHdnaocu9kmbarcvfhsaHcFbGhHcrhodninaP8SbbgrcFbGaotaHVhHarcu9kmeaPcefhPaocrfgoc8J9hmbkashPxekaPcefhPkaHce4cbaHceG9R7amfgmhskdndnaCcsSmbaPhoxekaPcefhoaP8SbbgrcFeGhHdnarcu9kmbaPcvfhOaHcFbGhHcrhrdninao8SbbgPcFbGartaHVhHaPcu9kmeaocefhoarcrfgrc8J9hmbkaOhoxekaocefhokaHce4cbaHceG9R7amfgmhOkdndnadcd9hmbabaDcetfgraA87ebarcdfas87ebarclfaO87ebxekabaDcdtfgraABdbarclfasBdbarcwfaOBdbkavc;abfalcitfgrasBdbaraABdlavaicdtfaABdbavc;abfalcefcsGcitfgraOBdbarasBdlavaicefgicsGcdtfasBdbavc;abfalcdfcsGcitfgraABdbaraOBdlavaiazcz6aXcsSVfgicsGcdtfaOBdbaiaCTaCcsSVfhialcifhlkawcefhwalcsGhlaicsGhiaDcifgDae6mbkkcbc99aoaqSEhokavc;aef8Kjjjjbaok:llevu8Jjjjjbcz9Rhvc9:hodnaecvfal0mbcuhoaiRbbc;:eGc;qe9hmbav9cb83iwaicefhraialfc98fhwdnaeTmbdnadcdSmbcbhDindnaraw6mbc9:skarcefhoar8SbbglcFeGhidndnalcu9mmbaohrxekarcvfhraicFbGhicrhldninao8SbbgdcFbGaltaiVhiadcu9kmeaocefhoalcrfglc8J9hmbxdkkaocefhrkabaDcdtfaicd4cbaice4ceG9R7avcwfaiceGcdtVgoydbfglBdbaoalBdbaDcefgDae9hmbxdkkcbhDindnaraw6mbc9:skarcefhoar8SbbglcFeGhidndnalcu9mmbaohrxekarcvfhraicFbGhicrhldninao8SbbgdcFbGaltaiVhiadcu9kmeaocefhoalcrfglc8J9hmbxdkkaocefhrkabaDcetfaicd4cbaice4ceG9R7avcwfaiceGcdtVgoydbfgl87ebaoalBdbaDcefgDae9hmbkkcbc99arawSEhokaok:EPliuo97eue978Jjjjjbca9Rhidndnadcl9hmbdnaec98GglTmbcbhvabhdinadadpbbbgocKp:RecKp:Sep;6egraocwp:RecKp:Sep;6earp;Geaoczp:RecKp:Sep;6egwp;Gep;Kep;LegDpxbbbbbbbbbbbbbbbbp:2egqarpxbbbjbbbjbbbjbbbjgkp9op9rp;Kegrpxbb;:9cbb;:9cbb;:9cbb;:9cararp;MeaDaDp;Meawaqawakp9op9rp;Kegrarp;Mep;Kep;Kep;Jep;Negwp;Mepxbbn0bbn0bbn0bbn0gqp;KepxFbbbFbbbFbbbFbbbp9oaopxbbbFbbbFbbbFbbbFp9op9qarawp;Meaqp;Kecwp:RepxbFbbbFbbbFbbbFbbp9op9qaDawp;Meaqp;Keczp:RepxbbFbbbFbbbFbbbFbp9op9qpkbbadczfhdavclfgval6mbkkalae9pmeaiaeciGgvcdtgdVcbczad9R;8kbaiabalcdtfglad;8qbbdnavTmbaiaipblbgocKp:RecKp:Sep;6egraocwp:RecKp:Sep;6earp;Geaoczp:RecKp:Sep;6egwp;Gep;Kep;LegDpxbbbbbbbbbbbbbbbbp:2egqarpxbbbjbbbjbbbjbbbjgkp9op9rp;Kegrpxbb;:9cbb;:9cbb;:9cbb;:9cararp;MeaDaDp;Meawaqawakp9op9rp;Kegrarp;Mep;Kep;Kep;Jep;Negwp;Mepxbbn0bbn0bbn0bbn0gqp;KepxFbbbFbbbFbbbFbbbp9oaopxbbbFbbbFbbbFbbbFp9op9qarawp;Meaqp;Kecwp:RepxbFbbbFbbbFbbbFbbp9op9qaDawp;Meaqp;Keczp:RepxbbFbbbFbbbFbbbFbp9op9qpklbkalaiad;8qbbskdnaec98GgxTmbcbhvabhdinadczfglalpbbbgopxbbbbbbFFbbbbbbFFgkp9oadpbbbgDaopmlvorxmPsCXQL358E8FpxFubbFubbFubbFubbp9op;6eaDaopmbediwDqkzHOAKY8AEgoczp:Sep;6egrp;Geaoczp:Reczp:Sep;6egwp;Gep;Kep;Legopxb;:FSb;:FSb;:FSb;:FSawaopxbbbbbbbbbbbbbbbbp:2egqawpxbbbjbbbjbbbjbbbjgmp9op9rp;Kegwawp;Meaoaop;Mearaqaramp9op9rp;Kegoaop;Mep;Kep;Kep;Jep;Negrp;Mepxbbn0bbn0bbn0bbn0gqp;Keczp:Reawarp;Meaqp;KepxFFbbFFbbFFbbFFbbp9op9qgwaoarp;Meaqp;KepxFFbbFFbbFFbbFFbbp9ogopmwDKYqk8AExm35Ps8E8Fp9qpkbbadaDakp9oawaopmbezHdiOAlvCXorQLp9qpkbbadcafhdavclfgvax6mbkkaxae9pmbaiaeciGgvcitgdfcbcaad9R;8kbaiabaxcitfglad;8qbbdnavTmbaiaipblzgopxbbbbbbFFbbbbbbFFgkp9oaipblbgDaopmlvorxmPsCXQL358E8FpxFubbFubbFubbFubbp9op;6eaDaopmbediwDqkzHOAKY8AEgoczp:Sep;6egrp;Geaoczp:Reczp:Sep;6egwp;Gep;Kep;Legopxb;:FSb;:FSb;:FSb;:FSawaopxbbbbbbbbbbbbbbbbp:2egqawpxbbbjbbbjbbbjbbbjgmp9op9rp;Kegwawp;Meaoaop;Mearaqaramp9op9rp;Kegoaop;Mep;Kep;Kep;Jep;Negrp;Mepxbbn0bbn0bbn0bbn0gqp;Keczp:Reawarp;Meaqp;KepxFFbbFFbbFFbbFFbbp9op9qgwaoarp;Meaqp;KepxFFbbFFbbFFbbFFbbp9ogopmwDKYqk8AExm35Ps8E8Fp9qpklzaiaDakp9oawaopmbezHdiOAlvCXorQLp9qpklbkalaiad;8qbbkk;4wllue97euv978Jjjjjbc8W9Rhidnaec98GglTmbcbhvabhoinaiaopbbbgraoczfgwpbbbgDpmlvorxmPsCXQL358E8Fgqczp:Segkclp:RepklbaopxbbjZbbjZbbjZbbjZpx;Zl81Z;Zl81Z;Zl81Z;Zl81Zakpxibbbibbbibbbibbbp9qp;6ep;NegkaraDpmbediwDqkzHOAKY8AEgrczp:Reczp:Sep;6ep;MegDaDp;Meakarczp:Sep;6ep;Megxaxp;Meakaqczp:Reczp:Sep;6ep;Megqaqp;Mep;Kep;Kep;Lepxbbbbbbbbbbbbbbbbp:4ep;Jepxb;:FSb;:FSb;:FSb;:FSgkp;Mepxbbn0bbn0bbn0bbn0grp;KepxFFbbFFbbFFbbFFbbgmp9oaxakp;Mearp;Keczp:Rep9qgxaqakp;Mearp;Keczp:ReaDakp;Mearp;Keamp9op9qgkpmbezHdiOAlvCXorQLgrp5baipblbpEb:T:j83ibaocwfarp5eaipblbpEe:T:j83ibawaxakpmwDKYqk8AExm35Ps8E8Fgkp5baipblbpEd:T:j83ibaocKfakp5eaipblbpEi:T:j83ibaocafhoavclfgval6mbkkdnalae9pmbaiaeciGgvcitgofcbcaao9R;8kbaiabalcitfgwao;8qbbdnavTmbaiaipblbgraipblzgDpmlvorxmPsCXQL358E8Fgqczp:Segkclp:RepklaaipxbbjZbbjZbbjZbbjZpx;Zl81Z;Zl81Z;Zl81Z;Zl81Zakpxibbbibbbibbbibbbp9qp;6ep;NegkaraDpmbediwDqkzHOAKY8AEgrczp:Reczp:Sep;6ep;MegDaDp;Meakarczp:Sep;6ep;Megxaxp;Meakaqczp:Reczp:Sep;6ep;Megqaqp;Mep;Kep;Kep;Lepxbbbbbbbbbbbbbbbbp:4ep;Jepxb;:FSb;:FSb;:FSb;:FSgkp;Mepxbbn0bbn0bbn0bbn0grp;KepxFFbbFFbbFFbbFFbbgmp9oaxakp;Mearp;Keczp:Rep9qgxaqakp;Mearp;Keczp:ReaDakp;Mearp;Keamp9op9qgkpmbezHdiOAlvCXorQLgrp5baipblapEb:T:j83ibaiarp5eaipblapEe:T:j83iwaiaxakpmwDKYqk8AExm35Ps8E8Fgkp5baipblapEd:T:j83izaiakp5eaipblapEi:T:j83iKkawaiao;8qbbkk:Pddiue978Jjjjjbc;ab9Rhidnadcd4ae2glc98GgvTmbcbhdabheinaeaepbbbgocwp:Recwp:Sep;6eaocep:SepxbbjZbbjZbbjZbbjZp:UepxbbjFbbjFbbjFbbjFp9op;Mepkbbaeczfheadclfgdav6mbkkdnaval9pmbaialciGgdcdtgeVcbc;abae9R;8kbaiabavcdtfgvae;8qbbdnadTmbaiaipblbgocwp:Recwp:Sep;6eaocep:SepxbbjZbbjZbbjZbbjZp:UepxbbjFbbjFbbjFbbjFp9op;Mepklbkavaiae;8qbbkk9teiucbcbydj1jjbgeabcifc98GfgbBdj1jjbdndnabZbcztgd9nmbcuhiabad9RcFFifcz4nbcuSmekaehikaikkkebcjwklz9Tbb";

	var detector = new Uint8Array([0,97,115,109,1,0,0,0,1,4,1,96,0,0,3,3,2,0,0,5,3,1,0,1,12,1,0,10,22,2,12,0,65,0,65,0,65,0,252,10,0,0,11,7,0,65,0,253,15,26,11]);
	var wasmpack = new Uint8Array([32,0,65,2,1,106,34,33,3,128,11,4,13,64,6,253,10,7,15,116,127,5,8,12,40,16,19,54,20,9,27,255,113,17,42,67,24,23,146,148,18,14,22,45,70,69,56,114,101,21,25,63,75,136,108,28,118,29,73,115]);

	if (typeof WebAssembly !== 'object') {
		return {
			supported: false,
		};
	}

	var wasm = WebAssembly.validate(detector) ? wasm_simd : wasm_base;

	var instance;

	var ready =
		WebAssembly.instantiate(unpack(wasm), {})
		.then(function(result) {
			instance = result.instance;
			instance.exports.__wasm_call_ctors();
		});

	function unpack(data) {
		var result = new Uint8Array(data.length);
		for (var i = 0; i < data.length; ++i) {
			var ch = data.charCodeAt(i);
			result[i] = ch > 96 ? ch - 97 : ch > 64 ? ch - 39 : ch + 4;
		}
		var write = 0;
		for (var i = 0; i < data.length; ++i) {
			result[write++] = (result[i] < 60) ? wasmpack[result[i]] : (result[i] - 60) * 64 + result[++i];
		}
		return result.buffer.slice(0, write);
	}

	function decode(fun, target, count, size, source, filter) {
		var sbrk = instance.exports.sbrk;
		var count4 = (count + 3) & -4;
		var tp = sbrk(count4 * size);
		var sp = sbrk(source.length);
		var heap = new Uint8Array(instance.exports.memory.buffer);
		heap.set(source, sp);
		var res = fun(tp, count, size, sp, source.length);
		if (res == 0 && filter) {
			filter(tp, count4, size);
		}
		target.set(heap.subarray(tp, tp + count * size));
		sbrk(tp - sbrk(0));
		if (res != 0) {
			throw new Error("Malformed buffer data: " + res);
		}
	}

	var filters = {
		NONE: "",
		OCTAHEDRAL: "meshopt_decodeFilterOct",
		QUATERNION: "meshopt_decodeFilterQuat",
		EXPONENTIAL: "meshopt_decodeFilterExp",
	};

	var decoders = {
		ATTRIBUTES: "meshopt_decodeVertexBuffer",
		TRIANGLES: "meshopt_decodeIndexBuffer",
		INDICES: "meshopt_decodeIndexSequence",
	};

	var workers = [];
	var requestId = 0;

	function createWorker(url) {
		var worker = {
			object: new Worker(url),
			pending: 0,
			requests: {}
		};

		worker.object.onmessage = function(event) {
			var data = event.data;

			worker.pending -= data.count;
			worker.requests[data.id][data.action](data.value);

			delete worker.requests[data.id];
		};

		return worker;
	}

	function initWorkers(count) {
		var source =
			"var instance; var ready = WebAssembly.instantiate(new Uint8Array([" + new Uint8Array(unpack(wasm)) + "]), {})" +
			".then(function(result) { instance = result.instance; instance.exports.__wasm_call_ctors(); });" +
			"self.onmessage = workerProcess;" +
			decode.toString() + workerProcess.toString();

		var blob = new Blob([source], {type: 'text/javascript'});
		var url = URL.createObjectURL(blob);

		for (var i = 0; i < count; ++i) {
			workers[i] = createWorker(url);
		}

		URL.revokeObjectURL(url);
	}

	function decodeWorker(count, size, source, mode, filter) {
		var worker = workers[0];

		for (var i = 1; i < workers.length; ++i) {
			if (workers[i].pending < worker.pending) {
				worker = workers[i];
			}
		}

		return new Promise(function (resolve, reject) {
			var data = new Uint8Array(source);
			var id = requestId++;

			worker.pending += count;
			worker.requests[id] = { resolve: resolve, reject: reject };
			worker.object.postMessage({ id: id, count: count, size: size, source: data, mode: mode, filter: filter }, [ data.buffer ]);
		});
	}

	function workerProcess(event) {
		ready.then(function() {
			var data = event.data;
			try {
				var target = new Uint8Array(data.count * data.size);
				decode(instance.exports[data.mode], target, data.count, data.size, data.source, instance.exports[data.filter]);
				self.postMessage({ id: data.id, count: data.count, action: "resolve", value: target }, [ target.buffer ]);
			} catch (error) {
				self.postMessage({ id: data.id, count: data.count, action: "reject", value: error });
			}
		});
	}

	return {
		ready: ready,
		supported: true,
		useWorkers: function(count) {
			initWorkers(count);
		},
		decodeVertexBuffer: function(target, count, size, source, filter) {
			decode(instance.exports.meshopt_decodeVertexBuffer, target, count, size, source, instance.exports[filters[filter]]);
		},
		decodeIndexBuffer: function(target, count, size, source) {
			decode(instance.exports.meshopt_decodeIndexBuffer, target, count, size, source);
		},
		decodeIndexSequence: function(target, count, size, source) {
			decode(instance.exports.meshopt_decodeIndexSequence, target, count, size, source);
		},
		decodeGltfBuffer: function(target, count, size, source, mode, filter) {
			decode(instance.exports[decoders[mode]], target, count, size, source, instance.exports[filters[filter]]);
		},
		decodeGltfBufferAsync: function(count, size, source, mode, filter) {
			if (workers.length > 0) {
				return decodeWorker(count, size, source, decoders[mode], filters[filter]);
			}

			return ready.then(function() {
				var target = new Uint8Array(count * size);
				decode(instance.exports[decoders[mode]], target, count, size, source, instance.exports[filters[filter]]);
				return target;
			});
		}
	};
})();

const extToType = new Map([
    ['bin', 'binary'],
    ['css', 'css'],
    ['frag', 'shader'],
    ['glb', 'container'],
    ['glsl', 'shader'],
    ['hdr', 'texture'],
    ['html', 'html'],
    ['jpg', 'texture'],
    ['js', 'script'],
    ['json', 'json'],
    ['mp3', 'audio'],
    ['mjs', 'script'],
    ['ply', 'gsplat'],
    ['png', 'texture'],
    ['txt', 'text'],
    ['vert', 'shader'],
    ['webp', 'texture']
]);
// provide buffer view callback so we can handle models compressed with MeshOptimizer
// https://github.com/zeux/meshoptimizer
const processBufferView = (gltfBuffer, buffers, continuation) => {
    if (gltfBuffer.extensions && gltfBuffer.extensions.EXT_meshopt_compression) {
        const extensionDef = gltfBuffer.extensions.EXT_meshopt_compression;
        Promise.all([MeshoptDecoder.ready, buffers[extensionDef.buffer]]).then((promiseResult) => {
            const buffer = promiseResult[1];
            const byteOffset = extensionDef.byteOffset || 0;
            const byteLength = extensionDef.byteLength || 0;
            const count = extensionDef.count;
            const stride = extensionDef.byteStride;
            const result = new Uint8Array(count * stride);
            const source = new Uint8Array(buffer.buffer, buffer.byteOffset + byteOffset, byteLength);
            MeshoptDecoder.decodeGltfBuffer(result, count, stride, source, extensionDef.mode, extensionDef.filter);
            continuation(null, result);
        });
    }
    else {
        continuation(null, null);
    }
};
/**
 * The AssetElement interface provides properties and methods for manipulating
 * {@link https://developer.playcanvas.com/user-manual/engine/web-components/tags/pc-asset/ | `<pc-asset>`} elements.
 * The AssetElement interface also inherits the properties and methods of the
 * {@link HTMLElement} interface.
 */
class AssetElement extends HTMLElement {
    constructor() {
        super(...arguments);
        this._lazy = false;
        /**
         * The asset that is loaded.
         */
        this.asset = null;
    }
    disconnectedCallback() {
        this.destroyAsset();
    }
    createAsset() {
        var _a;
        const id = this.getAttribute('id') || '';
        const src = this.getAttribute('src') || '';
        let type = this.getAttribute('type');
        // If no type is specified, try to infer it from the file extension.
        if (!type) {
            const ext = src.split('.').pop();
            type = (_a = extToType.get(ext || '')) !== null && _a !== void 0 ? _a : null;
        }
        if (!type) {
            console.warn(`Unsupported asset type: ${src}`);
            return;
        }
        if (type === 'container') {
            this.asset = new Asset(id, type, { url: src }, undefined, {
                // @ts-ignore TODO no definition in pc
                bufferView: {
                    processAsync: processBufferView.bind(this)
                }
            });
        }
        else {
            this.asset = new Asset(id, type, { url: src });
        }
        this.asset.preload = !this._lazy;
    }
    destroyAsset() {
        if (this.asset) {
            this.asset.unload();
            this.asset = null;
        }
    }
    /**
     * Sets whether the asset should be loaded lazily.
     * @param value - The lazy loading flag.
     */
    set lazy(value) {
        this._lazy = value;
        if (this.asset) {
            this.asset.preload = !value;
        }
    }
    /**
     * Gets whether the asset should be loaded lazily.
     * @returns The lazy loading flag.
     */
    get lazy() {
        return this._lazy;
    }
    static get(id) {
        const assetElement = document.querySelector(`pc-asset[id="${id}"]`);
        return assetElement === null || assetElement === void 0 ? void 0 : assetElement.asset;
    }
    static get observedAttributes() {
        return ['lazy'];
    }
    attributeChangedCallback(name, _oldValue, _newValue) {
        if (name === 'lazy') {
            this.lazy = this.hasAttribute('lazy');
        }
    }
}
customElements.define('pc-asset', AssetElement);

/**
 * Represents a component in the PlayCanvas engine.
 *
 * @category Components
 */
class ComponentElement extends AsyncElement {
    /**
     * Creates a new ComponentElement instance.
     *
     * @param componentName - The name of the component.
     * @ignore
     */
    constructor(componentName) {
        super();
        this._enabled = true;
        this._component = null;
        this._componentName = componentName;
    }
    // Method to be overridden by subclasses to provide initial component data
    getInitialComponentData() {
        return {};
    }
    async addComponent() {
        const entityElement = this.closestEntity;
        if (entityElement) {
            await entityElement.ready();
            // Add the component to the entity
            const data = this.getInitialComponentData();
            this._component = entityElement.entity.addComponent(this._componentName, data);
        }
    }
    initComponent() { }
    async connectedCallback() {
        var _a;
        await ((_a = this.closestApp) === null || _a === void 0 ? void 0 : _a.ready());
        await this.addComponent();
        this.initComponent();
        this._onReady();
    }
    disconnectedCallback() {
        // Remove the component when the element is disconnected
        if (this.component && this.component.entity) {
            this._component.entity.removeComponent(this._componentName);
            this._component = null;
        }
    }
    get component() {
        return this._component;
    }
    /**
     * Sets the enabled state of the component.
     * @param value - The enabled state of the component.
     */
    set enabled(value) {
        this._enabled = value;
        if (this.component) {
            this.component.enabled = value;
        }
    }
    /**
     * Gets the enabled state of the component.
     * @returns The enabled state of the component.
     */
    get enabled() {
        return this._enabled;
    }
    static get observedAttributes() {
        return ['enabled'];
    }
    attributeChangedCallback(name, _oldValue, newValue) {
        switch (name) {
            case 'enabled':
                this.enabled = newValue !== 'false';
                break;
        }
    }
}

/**
 * The ListenerComponentElement interface provides properties and methods for manipulating
 * {@link https://developer.playcanvas.com/user-manual/engine/web-components/tags/pc-listener/ | `<pc-listener>`} elements.
 * The ListenerComponentElement interface also inherits the properties and methods of the
 * {@link HTMLElement} interface.
 *
 * @category Components
 */
class ListenerComponentElement extends ComponentElement {
    /** @ignore */
    constructor() {
        super('audiolistener');
    }
    /**
     * Gets the underlying PlayCanvas audio listener component.
     * @returns The audio listener component.
     */
    get component() {
        return super.component;
    }
}
customElements.define('pc-listener', ListenerComponentElement);

const tonemaps = new Map([
    ['none', TONEMAP_NONE],
    ['linear', TONEMAP_LINEAR],
    ['filmic', TONEMAP_FILMIC],
    ['hejl', TONEMAP_HEJL],
    ['aces', TONEMAP_ACES],
    ['aces2', TONEMAP_ACES2],
    ['neutral', TONEMAP_NEUTRAL]
]);
/**
 * The CameraComponentElement interface provides properties and methods for manipulating
 * {@link https://developer.playcanvas.com/user-manual/engine/web-components/tags/pc-camera/ | `<pc-camera>`} elements.
 * The CameraComponentElement interface also inherits the properties and methods of the
 * {@link HTMLElement} interface.
 *
 * @category Components
 */
class CameraComponentElement extends ComponentElement {
    /** @ignore */
    constructor() {
        super('camera');
        this._clearColor = new Color(0.75, 0.75, 0.75, 1);
        this._clearColorBuffer = true;
        this._clearDepthBuffer = true;
        this._clearStencilBuffer = false;
        this._cullFaces = true;
        this._farClip = 1000;
        this._flipFaces = false;
        this._fov = 45;
        this._frustumCulling = true;
        this._gamma = 'srgb';
        this._horizontalFov = false;
        this._nearClip = 0.1;
        this._orthographic = false;
        this._orthoHeight = 10;
        this._priority = 0;
        this._rect = new Vec4(0, 0, 1, 1);
        this._scissorRect = new Vec4(0, 0, 1, 1);
        this._tonemap = 'none';
    }
    getInitialComponentData() {
        return {
            clearColor: this._clearColor,
            clearColorBuffer: this._clearColorBuffer,
            clearDepthBuffer: this._clearDepthBuffer,
            clearStencilBuffer: this._clearStencilBuffer,
            cullFaces: this._cullFaces,
            farClip: this._farClip,
            flipFaces: this._flipFaces,
            fov: this._fov,
            frustumCulling: this._frustumCulling,
            gammaCorrection: this._gamma === 'srgb' ? GAMMA_SRGB : GAMMA_NONE,
            horizontalFov: this._horizontalFov,
            nearClip: this._nearClip,
            orthographic: this._orthographic,
            orthoHeight: this._orthoHeight,
            priority: this._priority,
            rect: this._rect,
            scissorRect: this._scissorRect,
            toneMapping: tonemaps.get(this._tonemap)
        };
    }
    get xrAvailable() {
        var _a;
        const xrManager = (_a = this.component) === null || _a === void 0 ? void 0 : _a.system.app.xr;
        return xrManager && xrManager.supported && xrManager.isAvailable(XRTYPE_VR);
    }
    /**
     * Starts the camera in XR mode.
     * @param type - The type of XR mode to start.
     * @param space - The space to start the camera in.
     */
    startXr(type, space) {
        if (this.component && this.xrAvailable) {
            this.component.startXr(type, space, {
                callback: (err) => {
                    if (err)
                        console.error(`WebXR Immersive VR failed to start: ${err.message}`);
                }
            });
        }
    }
    /**
     * Ends the camera's XR mode.
     */
    endXr() {
        if (this.component) {
            this.component.endXr();
        }
    }
    /**
     * Gets the underlying PlayCanvas camera component.
     * @returns The camera component.
     */
    get component() {
        return super.component;
    }
    /**
     * Sets the clear color of the camera.
     * @param value - The clear color.
     */
    set clearColor(value) {
        this._clearColor = value;
        if (this.component) {
            this.component.clearColor = value;
        }
    }
    /**
     * Gets the clear color of the camera.
     * @returns The clear color.
     */
    get clearColor() {
        return this._clearColor;
    }
    /**
     * Sets the clear color buffer of the camera.
     * @param value - The clear color buffer.
     */
    set clearColorBuffer(value) {
        this._clearColorBuffer = value;
        if (this.component) {
            this.component.clearColorBuffer = value;
        }
    }
    /**
     * Gets the clear color buffer of the camera.
     * @returns The clear color buffer.
     */
    get clearColorBuffer() {
        return this._clearColorBuffer;
    }
    /**
     * Sets the clear depth buffer of the camera.
     * @param value - The clear depth buffer.
     */
    set clearDepthBuffer(value) {
        this._clearDepthBuffer = value;
        if (this.component) {
            this.component.clearDepthBuffer = value;
        }
    }
    /**
     * Gets the clear depth buffer of the camera.
     * @returns The clear depth buffer.
     */
    get clearDepthBuffer() {
        return this._clearDepthBuffer;
    }
    /**
     * Sets the clear stencil buffer of the camera.
     * @param value - The clear stencil buffer.
     */
    set clearStencilBuffer(value) {
        this._clearStencilBuffer = value;
        if (this.component) {
            this.component.clearStencilBuffer = value;
        }
    }
    /**
     * Gets the clear stencil buffer of the camera.
     * @returns The clear stencil buffer.
     */
    get clearStencilBuffer() {
        return this._clearStencilBuffer;
    }
    /**
     * Sets the cull faces of the camera.
     * @param value - The cull faces.
     */
    set cullFaces(value) {
        this._cullFaces = value;
        if (this.component) {
            this.component.cullFaces = value;
        }
    }
    /**
     * Gets the cull faces of the camera.
     * @returns The cull faces.
     */
    get cullFaces() {
        return this._cullFaces;
    }
    /**
     * Sets the far clip distance of the camera.
     * @param value - The far clip distance.
     */
    set farClip(value) {
        this._farClip = value;
        if (this.component) {
            this.component.farClip = value;
        }
    }
    /**
     * Gets the far clip distance of the camera.
     * @returns The far clip distance.
     */
    get farClip() {
        return this._farClip;
    }
    /**
     * Sets the flip faces of the camera.
     * @param value - The flip faces.
     */
    set flipFaces(value) {
        this._flipFaces = value;
        if (this.component) {
            this.component.flipFaces = value;
        }
    }
    /**
     * Gets the flip faces of the camera.
     * @returns The flip faces.
     */
    get flipFaces() {
        return this._flipFaces;
    }
    /**
     * Sets the field of view of the camera.
     * @param value - The field of view.
     */
    set fov(value) {
        this._fov = value;
        if (this.component) {
            this.component.fov = value;
        }
    }
    /**
     * Gets the field of view of the camera.
     * @returns The field of view.
     */
    get fov() {
        return this._fov;
    }
    /**
     * Sets the frustum culling of the camera.
     * @param value - The frustum culling.
     */
    set frustumCulling(value) {
        this._frustumCulling = value;
        if (this.component) {
            this.component.frustumCulling = value;
        }
    }
    /**
     * Gets the frustum culling of the camera.
     * @returns The frustum culling.
     */
    get frustumCulling() {
        return this._frustumCulling;
    }
    /**
     * Sets the gamma correction of the camera.
     * @param value - The gamma correction.
     */
    set gamma(value) {
        this._gamma = value;
        if (this.component) {
            this.component.gammaCorrection = value === 'srgb' ? GAMMA_SRGB : GAMMA_NONE;
        }
    }
    /**
     * Gets the gamma correction of the camera.
     * @returns The gamma correction.
     */
    get gamma() {
        return this._gamma;
    }
    /**
     * Sets whether the camera's field of view (fov) is horizontal or vertical. Defaults to false
     * (meaning it is vertical be default).
     * @param value - Whether the camera's field of view is horizontal.
     */
    set horizontalFov(value) {
        this._horizontalFov = value;
        if (this.component) {
            this.component.horizontalFov = value;
        }
    }
    /**
     * Gets whether the camera's field of view (fov) is horizontal or vertical.
     * @returns Whether the camera's field of view is horizontal.
     */
    get horizontalFov() {
        return this._horizontalFov;
    }
    /**
     * Sets the near clip distance of the camera.
     * @param value - The near clip distance.
     */
    set nearClip(value) {
        this._nearClip = value;
        if (this.component) {
            this.component.nearClip = value;
        }
    }
    /**
     * Gets the near clip distance of the camera.
     * @returns The near clip distance.
     */
    get nearClip() {
        return this._nearClip;
    }
    /**
     * Sets the orthographic projection of the camera.
     * @param value - The orthographic projection.
     */
    set orthographic(value) {
        this._orthographic = value;
        if (this.component) {
            this.component.projection = value ? PROJECTION_ORTHOGRAPHIC : PROJECTION_PERSPECTIVE;
        }
    }
    /**
     * Gets the orthographic projection of the camera.
     * @returns The orthographic projection.
     */
    get orthographic() {
        return this._orthographic;
    }
    /**
     * Sets the orthographic height of the camera.
     * @param value - The orthographic height.
     */
    set orthoHeight(value) {
        this._orthoHeight = value;
        if (this.component) {
            this.component.orthoHeight = value;
        }
    }
    /**
     * Gets the orthographic height of the camera.
     * @returns The orthographic height.
     */
    get orthoHeight() {
        return this._orthoHeight;
    }
    /**
     * Sets the priority of the camera.
     * @param value - The priority.
     */
    set priority(value) {
        this._priority = value;
        if (this.component) {
            this.component.priority = value;
        }
    }
    /**
     * Gets the priority of the camera.
     * @returns The priority.
     */
    get priority() {
        return this._priority;
    }
    /**
     * Sets the rect of the camera.
     * @param value - The rect.
     */
    set rect(value) {
        this._rect = value;
        if (this.component) {
            this.component.rect = value;
        }
    }
    /**
     * Gets the rect of the camera.
     * @returns The rect.
     */
    get rect() {
        return this._rect;
    }
    /**
     * Sets the scissor rect of the camera.
     * @param value - The scissor rect.
     */
    set scissorRect(value) {
        this._scissorRect = value;
        if (this.component) {
            this.component.scissorRect = value;
        }
    }
    /**
     * Gets the scissor rect of the camera.
     * @returns The scissor rect.
     */
    get scissorRect() {
        return this._scissorRect;
    }
    /**
     * Sets the tone mapping of the camera.
     * @param value - The tone mapping.
     */
    set tonemap(value) {
        var _a;
        this._tonemap = value;
        if (this.component) {
            this.component.toneMapping = (_a = tonemaps.get(value)) !== null && _a !== void 0 ? _a : TONEMAP_NONE;
        }
    }
    /**
     * Gets the tone mapping of the camera.
     * @returns The tone mapping.
     */
    get tonemap() {
        return this._tonemap;
    }
    static get observedAttributes() {
        return [
            ...super.observedAttributes,
            'clear-color',
            'clear-color-buffer',
            'clear-depth-buffer',
            'clear-stencil-buffer',
            'cull-faces',
            'far-clip',
            'flip-faces',
            'fov',
            'frustum-culling',
            'gamma',
            'horizontal-fov',
            'near-clip',
            'orthographic',
            'ortho-height',
            'priority',
            'rect',
            'scissor-rect',
            'tonemap'
        ];
    }
    attributeChangedCallback(name, _oldValue, newValue) {
        super.attributeChangedCallback(name, _oldValue, newValue);
        switch (name) {
            case 'clear-color':
                this.clearColor = parseColor(newValue);
                break;
            case 'clear-color-buffer':
                this.clearColorBuffer = newValue !== 'false';
                break;
            case 'clear-depth-buffer':
                this.clearDepthBuffer = newValue !== 'false';
                break;
            case 'clear-stencil-buffer':
                this.clearStencilBuffer = newValue !== 'false';
                break;
            case 'cull-faces':
                this.cullFaces = newValue !== 'false';
                break;
            case 'far-clip':
                this.farClip = parseFloat(newValue);
                break;
            case 'flip-faces':
                this.flipFaces = newValue !== 'true';
                break;
            case 'fov':
                this.fov = parseFloat(newValue);
                break;
            case 'frustum-culling':
                this.frustumCulling = newValue !== 'false';
                break;
            case 'gamma':
                this.gamma = newValue;
                break;
            case 'horizontal-fov':
                this.horizontalFov = this.hasAttribute('horizontal-fov');
                break;
            case 'near-clip':
                this.nearClip = parseFloat(newValue);
                break;
            case 'orthographic':
                this.orthographic = this.hasAttribute('orthographic');
                break;
            case 'ortho-height':
                this.orthoHeight = parseFloat(newValue);
                break;
            case 'priority':
                this.priority = parseFloat(newValue);
                break;
            case 'rect':
                this.rect = parseVec4(newValue);
                break;
            case 'scissor-rect':
                this.scissorRect = parseVec4(newValue);
                break;
            case 'tonemap':
                this.tonemap = newValue;
                break;
        }
    }
}
customElements.define('pc-camera', CameraComponentElement);

/**
 * The CollisionComponentElement interface provides properties and methods for manipulating
 * {@link https://developer.playcanvas.com/user-manual/engine/web-components/tags/pc-collision/ | `<pc-collision>`} elements.
 * The CollisionComponentElement interface also inherits the properties and methods of the
 * {@link HTMLElement} interface.
 *
 * @category Components
 */
class CollisionComponentElement extends ComponentElement {
    /** @ignore */
    constructor() {
        super('collision');
        this._angularOffset = new Quat();
        this._axis = 1;
        this._convexHull = false;
        this._halfExtents = new Vec3(0.5, 0.5, 0.5);
        this._height = 2;
        this._linearOffset = new Vec3();
        this._radius = 0.5;
        this._type = 'box';
    }
    getInitialComponentData() {
        return {
            axis: this._axis,
            angularOffset: this._angularOffset,
            convexHull: this._convexHull,
            halfExtents: this._halfExtents,
            height: this._height,
            linearOffset: this._linearOffset,
            radius: this._radius,
            type: this._type
        };
    }
    /**
     * Gets the underlying PlayCanvas collision component.
     * @returns The collision component.
     */
    get component() {
        return super.component;
    }
    set angularOffset(value) {
        this._angularOffset = value;
        if (this.component) {
            this.component.angularOffset = value;
        }
    }
    get angularOffset() {
        return this._angularOffset;
    }
    set axis(value) {
        this._axis = value;
        if (this.component) {
            this.component.axis = value;
        }
    }
    get axis() {
        return this._axis;
    }
    set convexHull(value) {
        this._convexHull = value;
        if (this.component) {
            this.component.convexHull = value;
        }
    }
    get convexHull() {
        return this._convexHull;
    }
    set halfExtents(value) {
        this._halfExtents = value;
        if (this.component) {
            this.component.halfExtents = value;
        }
    }
    get halfExtents() {
        return this._halfExtents;
    }
    set height(value) {
        this._height = value;
        if (this.component) {
            this.component.height = value;
        }
    }
    get height() {
        return this._height;
    }
    set linearOffset(value) {
        this._linearOffset = value;
        if (this.component) {
            this.component.linearOffset = value;
        }
    }
    get linearOffset() {
        return this._linearOffset;
    }
    set radius(value) {
        this._radius = value;
        if (this.component) {
            this.component.radius = value;
        }
    }
    get radius() {
        return this._radius;
    }
    set type(value) {
        this._type = value;
        if (this.component) {
            this.component.type = value;
        }
    }
    get type() {
        return this._type;
    }
    static get observedAttributes() {
        return [...super.observedAttributes, 'angular-offset', 'axis', 'convex-hull', 'half-extents', 'height', 'linear-offset', 'radius', 'type'];
    }
    attributeChangedCallback(name, _oldValue, newValue) {
        super.attributeChangedCallback(name, _oldValue, newValue);
        switch (name) {
            case 'angular-offset':
                this.angularOffset = parseQuat(newValue);
                break;
            case 'axis':
                this.axis = parseInt(newValue, 10);
                break;
            case 'convex-hull':
                this.convexHull = this.hasAttribute('convex-hull');
                break;
            case 'half-extents':
                this.halfExtents = parseVec3(newValue);
                break;
            case 'height':
                this.height = parseFloat(newValue);
                break;
            case 'linear-offset':
                this.linearOffset = parseVec3(newValue);
                break;
            case 'radius':
                this.radius = parseFloat(newValue);
                break;
            case 'type':
                this.type = newValue;
                break;
        }
    }
}
customElements.define('pc-collision', CollisionComponentElement);

/**
 * The ElementComponentElement interface provides properties and methods for manipulating
 * {@link https://developer.playcanvas.com/user-manual/engine/web-components/tags/pc-element/ | `<pc-element>`} elements.
 * The ElementComponentElement interface also inherits the properties and methods of the
 * {@link HTMLElement} interface.
 *
 * @category Components
 */
class ElementComponentElement extends ComponentElement {
    /** @ignore */
    constructor() {
        super('element');
        this._anchor = new Vec4(0.5, 0.5, 0.5, 0.5);
        this._asset = '';
        this._autoWidth = true;
        this._color = new Color(1, 1, 1, 1);
        this._fontSize = 32;
        this._lineHeight = 32;
        this._pivot = new Vec2(0.5, 0.5);
        this._text = '';
        this._type = 'group';
        this._width = 0;
        this._wrapLines = false;
    }
    initComponent() {
        this.component._text._material.useFog = true;
    }
    getInitialComponentData() {
        return {
            anchor: this._anchor,
            autoWidth: this._autoWidth,
            color: this._color,
            fontAsset: AssetElement.get(this._asset).id,
            fontSize: this._fontSize,
            lineHeight: this._lineHeight,
            pivot: this._pivot,
            type: this._type,
            text: this._text,
            width: this._width,
            wrapLines: this._wrapLines
        };
    }
    /**
     * Gets the underlying PlayCanvas element component.
     * @returns The element component.
     */
    get component() {
        return super.component;
    }
    /**
     * Sets the anchor of the element component.
     * @param value - The anchor.
     */
    set anchor(value) {
        this._anchor = value;
        if (this.component) {
            this.component.anchor = value;
        }
    }
    /**
     * Gets the anchor of the element component.
     * @returns The anchor.
     */
    get anchor() {
        return this._anchor;
    }
    /**
     * Sets the id of the `pc-asset` to use for the font.
     * @param value - The asset ID.
     */
    set asset(value) {
        this._asset = value;
        const asset = AssetElement.get(value);
        if (this.component && asset) {
            this.component.fontAsset = asset.id;
        }
    }
    /**
     * Gets the id of the `pc-asset` to use for the font.
     * @returns The asset ID.
     */
    get asset() {
        return this._asset;
    }
    /**
     * Sets whether the element component should automatically adjust its width.
     * @param value - Whether to automatically adjust the width.
     */
    set autoWidth(value) {
        this._autoWidth = value;
        if (this.component) {
            this.component.autoWidth = value;
        }
    }
    /**
     * Gets whether the element component should automatically adjust its width.
     * @returns Whether to automatically adjust the width.
     */
    get autoWidth() {
        return this._autoWidth;
    }
    /**
     * Sets the color of the element component.
     * @param value - The color.
     */
    set color(value) {
        this._color = value;
        if (this.component) {
            this.component.color = value;
        }
    }
    /**
     * Gets the color of the element component.
     * @returns The color.
     */
    get color() {
        return this._color;
    }
    /**
     * Sets the font size of the element component.
     * @param value - The font size.
     */
    set fontSize(value) {
        this._fontSize = value;
        if (this.component) {
            this.component.fontSize = value;
        }
    }
    /**
     * Gets the font size of the element component.
     * @returns The font size.
     */
    get fontSize() {
        return this._fontSize;
    }
    /**
     * Sets the line height of the element component.
     * @param value - The line height.
     */
    set lineHeight(value) {
        this._lineHeight = value;
        if (this.component) {
            this.component.lineHeight = value;
        }
    }
    /**
     * Gets the line height of the element component.
     * @returns The line height.
     */
    get lineHeight() {
        return this._lineHeight;
    }
    /**
     * Sets the pivot of the element component.
     * @param value - The pivot.
     */
    set pivot(value) {
        this._pivot = value;
        if (this.component) {
            this.component.pivot = value;
        }
    }
    /**
     * Gets the pivot of the element component.
     * @returns The pivot.
     */
    get pivot() {
        return this._pivot;
    }
    /**
     * Sets the text of the element component.
     * @param value - The text.
     */
    set text(value) {
        this._text = value;
        if (this.component) {
            this.component.text = value;
        }
    }
    /**
     * Gets the text of the element component.
     * @returns The text.
     */
    get text() {
        return this._text;
    }
    /**
     * Sets the type of the element component.
     * @param value - The type.
     */
    set type(value) {
        this._type = value;
        if (this.component) {
            this.component.type = value;
        }
    }
    /**
     * Gets the type of the element component.
     * @returns The type.
     */
    get type() {
        return this._type;
    }
    /**
     * Sets the width of the element component.
     * @param value - The width.
     */
    set width(value) {
        this._width = value;
        if (this.component) {
            this.component.width = value;
        }
    }
    /**
     * Gets the width of the element component.
     * @returns The width.
     */
    get width() {
        return this._width;
    }
    /**
     * Sets whether the element component should wrap lines.
     * @param value - Whether to wrap lines.
     */
    set wrapLines(value) {
        this._wrapLines = value;
        if (this.component) {
            this.component.wrapLines = value;
        }
    }
    /**
     * Gets whether the element component should wrap lines.
     * @returns Whether to wrap lines.
     */
    get wrapLines() {
        return this._wrapLines;
    }
    static get observedAttributes() {
        return [
            ...super.observedAttributes,
            'anchor',
            'asset',
            'auto-width',
            'color',
            'font-size',
            'line-height',
            'pivot',
            'text',
            'type',
            'width',
            'wrap-lines'
        ];
    }
    attributeChangedCallback(name, _oldValue, newValue) {
        super.attributeChangedCallback(name, _oldValue, newValue);
        switch (name) {
            case 'anchor':
                this.anchor = parseVec4(newValue);
                break;
            case 'asset':
                this.asset = newValue;
                break;
            case 'auto-width':
                this.autoWidth = newValue !== 'false';
                break;
            case 'color':
                this.color = parseColor(newValue);
                break;
            case 'font-size':
                this.fontSize = Number(newValue);
                break;
            case 'line-height':
                this.lineHeight = Number(newValue);
                break;
            case 'pivot':
                this.pivot = parseVec2(newValue);
                break;
            case 'text':
                this.text = newValue;
                break;
            case 'type':
                this.type = newValue;
                break;
            case 'width':
                this.width = Number(newValue);
                break;
            case 'wrap-lines':
                this.wrapLines = this.hasAttribute(name);
                break;
        }
    }
}
customElements.define('pc-element', ElementComponentElement);

const shadowTypes = new Map([
    ['pcf1-16f', SHADOW_PCF1_16F],
    ['pcf1-32f', SHADOW_PCF1_32F],
    ['pcf3-16f', SHADOW_PCF3_16F],
    ['pcf3-32f', SHADOW_PCF3_32F],
    ['pcf5-16f', SHADOW_PCF5_16F],
    ['pcf5-32f', SHADOW_PCF5_32F],
    ['vsm-16f', SHADOW_VSM_16F],
    ['vsm-32f', SHADOW_VSM_32F],
    ['pcss-32f', SHADOW_PCSS_32F]
]);
/**
 * The LightComponentElement interface provides properties and methods for manipulating
 * {@link https://developer.playcanvas.com/user-manual/engine/web-components/tags/pc-light/ | `<pc-light>`} elements.
 * The LightComponentElement interface also inherits the properties and methods of the
 * {@link HTMLElement} interface.
 *
 * @category Components
 */
class LightComponentElement extends ComponentElement {
    /** @ignore */
    constructor() {
        super('light');
        this._castShadows = false;
        this._color = new Color(1, 1, 1);
        this._innerConeAngle = 40;
        this._intensity = 1;
        this._normalOffsetBias = 0.05;
        this._outerConeAngle = 45;
        this._range = 10;
        this._shadowBias = 0.2;
        this._shadowDistance = 16;
        this._shadowIntensity = 1;
        this._shadowResolution = 1024;
        this._shadowType = 'pcf3-32f';
        this._type = 'directional';
        this._vsmBias = 0.01;
    }
    getInitialComponentData() {
        return {
            castShadows: this._castShadows,
            color: this._color,
            innerConeAngle: this._innerConeAngle,
            intensity: this._intensity,
            normalOffsetBias: this._normalOffsetBias,
            outerConeAngle: this._outerConeAngle,
            range: this._range,
            shadowBias: this._shadowBias,
            shadowDistance: this._shadowDistance,
            shadowIntensity: this._shadowIntensity,
            shadowResolution: this._shadowResolution,
            shadowType: shadowTypes.get(this._shadowType),
            type: this._type,
            vsmBias: this._vsmBias
        };
    }
    /**
     * Gets the underlying PlayCanvas light component.
     * @returns The light component.
     */
    get component() {
        return super.component;
    }
    /**
     * Sets the cast shadows flag of the light.
     * @param value - The cast shadows flag.
     */
    set castShadows(value) {
        this._castShadows = value;
        if (this.component) {
            this.component.castShadows = value;
        }
    }
    /**
     * Gets the cast shadows flag of the light.
     * @returns The cast shadows flag.
     */
    get castShadows() {
        return this._castShadows;
    }
    /**
     * Sets the color of the light.
     * @param value - The color.
     */
    set color(value) {
        this._color = value;
        if (this.component) {
            this.component.color = value;
        }
    }
    /**
     * Gets the color of the light.
     * @returns The color.
     */
    get color() {
        return this._color;
    }
    /**
     * Sets the inner cone angle of the light.
     * @param value - The inner cone angle.
     */
    set innerConeAngle(value) {
        this._innerConeAngle = value;
        if (this.component) {
            this.component.innerConeAngle = value;
        }
    }
    /**
     * Gets the inner cone angle of the light.
     * @returns The inner cone angle.
     */
    get innerConeAngle() {
        return this._innerConeAngle;
    }
    /**
     * Sets the intensity of the light.
     * @param value - The intensity.
     */
    set intensity(value) {
        this._intensity = value;
        if (this.component) {
            this.component.intensity = value;
        }
    }
    /**
     * Gets the intensity of the light.
     * @returns The intensity.
     */
    get intensity() {
        return this._intensity;
    }
    /**
     * Sets the normal offset bias of the light.
     * @param value - The normal offset bias.
     */
    set normalOffsetBias(value) {
        this._normalOffsetBias = value;
        if (this.component) {
            this.component.normalOffsetBias = value;
        }
    }
    /**
     * Gets the normal offset bias of the light.
     * @returns The normal offset bias.
     */
    get normalOffsetBias() {
        return this._normalOffsetBias;
    }
    /**
     * Sets the outer cone angle of the light.
     * @param value - The outer cone angle.
     */
    set outerConeAngle(value) {
        this._outerConeAngle = value;
        if (this.component) {
            this.component.outerConeAngle = value;
        }
    }
    /**
     * Gets the outer cone angle of the light.
     * @returns The outer cone angle.
     */
    get outerConeAngle() {
        return this._outerConeAngle;
    }
    /**
     * Sets the range of the light.
     * @param value - The range.
     */
    set range(value) {
        this._range = value;
        if (this.component) {
            this.component.range = value;
        }
    }
    /**
     * Gets the range of the light.
     * @returns The range.
     */
    get range() {
        return this._range;
    }
    /**
     * Sets the shadow bias of the light.
     * @param value - The shadow bias.
     */
    set shadowBias(value) {
        this._shadowBias = value;
        if (this.component) {
            this.component.shadowBias = value;
        }
    }
    /**
     * Gets the shadow bias of the light.
     * @returns The shadow bias.
     */
    get shadowBias() {
        return this._shadowBias;
    }
    /**
     * Sets the shadow distance of the light.
     * @param value - The shadow distance.
     */
    set shadowDistance(value) {
        this._shadowDistance = value;
        if (this.component) {
            this.component.shadowDistance = value;
        }
    }
    /**
     * Gets the shadow distance of the light.
     * @returns The shadow distance.
     */
    get shadowDistance() {
        return this._shadowDistance;
    }
    /**
     * Sets the shadow intensity of the light.
     * @param value - The shadow intensity.
     */
    set shadowIntensity(value) {
        this._shadowIntensity = value;
        if (this.component) {
            this.component.shadowIntensity = value;
        }
    }
    /**
     * Gets the shadow intensity of the light.
     * @returns The shadow intensity.
     */
    get shadowIntensity() {
        return this._shadowIntensity;
    }
    /**
     * Sets the shadow resolution of the light.
     * @param value - The shadow resolution.
     */
    set shadowResolution(value) {
        this._shadowResolution = value;
        if (this.component) {
            this.component.shadowResolution = value;
        }
    }
    /**
     * Gets the shadow resolution of the light.
     * @returns The shadow resolution.
     */
    get shadowResolution() {
        return this._shadowResolution;
    }
    /**
     * Sets the shadow type of the light.
     * @param value - The shadow type. Can be:
     *
     * - `pcf1-16f` - 1-tap percentage-closer filtered shadow map with 16-bit depth.
     * - `pcf1-32f` - 1-tap percentage-closer filtered shadow map with 32-bit depth.
     * - `pcf3-16f` - 3-tap percentage-closer filtered shadow map with 16-bit depth.
     * - `pcf3-32f` - 3-tap percentage-closer filtered shadow map with 32-bit depth.
     * - `pcf5-16f` - 5-tap percentage-closer filtered shadow map with 16-bit depth.
     * - `pcf5-32f` - 5-tap percentage-closer filtered shadow map with 32-bit depth.
     * - `vsm-16f` - Variance shadow map with 16-bit depth.
     * - `vsm-32f` - Variance shadow map with 32-bit depth.
     * - `pcss-32f` - Percentage-closer soft shadow with 32-bit depth.
     */
    set shadowType(value) {
        var _a;
        this._shadowType = value;
        if (this.component) {
            this.component.shadowType = (_a = shadowTypes.get(value)) !== null && _a !== void 0 ? _a : SHADOW_PCF3_32F;
        }
    }
    /**
     * Gets the shadow type of the light.
     * @returns The shadow type.
     */
    get shadowType() {
        return this._shadowType;
    }
    /**
     * Sets the type of the light.
     * @param value - The type.
     */
    set type(value) {
        if (!['directional', 'omni', 'spot'].includes(value)) {
            console.warn(`Invalid light type '${value}', using default type '${this._type}'.`);
            return;
        }
        this._type = value;
        if (this.component) {
            this.component.type = value;
        }
    }
    /**
     * Gets the type of the light.
     * @returns The type.
     */
    get type() {
        return this._type;
    }
    /**
     * Sets the VSM bias of the light.
     * @param value - The VSM bias.
     */
    set vsmBias(value) {
        this._vsmBias = value;
        if (this.component) {
            this.component.vsmBias = value;
        }
    }
    /**
     * Gets the VSM bias of the light.
     * @returns The VSM bias.
     */
    get vsmBias() {
        return this._vsmBias;
    }
    static get observedAttributes() {
        return [
            ...super.observedAttributes,
            'color',
            'cast-shadows',
            'intensity',
            'inner-cone-angle',
            'normal-offset-bias',
            'outer-cone-angle',
            'range',
            'shadow-bias',
            'shadow-distance',
            'shadow-intensity',
            'shadow-resolution',
            'shadow-type',
            'type',
            'vsm-bias'
        ];
    }
    attributeChangedCallback(name, _oldValue, newValue) {
        super.attributeChangedCallback(name, _oldValue, newValue);
        switch (name) {
            case 'color':
                this.color = parseColor(newValue);
                break;
            case 'cast-shadows':
                this.castShadows = this.hasAttribute('cast-shadows');
                break;
            case 'inner-cone-angle':
                this.innerConeAngle = Number(newValue);
                break;
            case 'intensity':
                this.intensity = Number(newValue);
                break;
            case 'normal-offset-bias':
                this.normalOffsetBias = Number(newValue);
                break;
            case 'outer-cone-angle':
                this.outerConeAngle = Number(newValue);
                break;
            case 'range':
                this.range = Number(newValue);
                break;
            case 'shadow-bias':
                this.shadowBias = Number(newValue);
                break;
            case 'shadow-distance':
                this.shadowDistance = Number(newValue);
                break;
            case 'shadow-resolution':
                this.shadowResolution = Number(newValue);
                break;
            case 'shadow-intensity':
                this.shadowIntensity = Number(newValue);
                break;
            case 'shadow-type':
                this.shadowType = newValue;
                break;
            case 'type':
                this.type = newValue;
                break;
            case 'vsm-bias':
                this.vsmBias = Number(newValue);
                break;
        }
    }
}
customElements.define('pc-light', LightComponentElement);

/**
 * The ParticleSystemComponentElement interface provides properties and methods for manipulating
 * {@link https://developer.playcanvas.com/user-manual/engine/web-components/tags/pc-particles/ | `<pc-particles>`} elements.
 * The ParticleSystemComponentElement interface also inherits the properties and methods of the
 * {@link HTMLElement} interface.
 *
 * @category Components
 */
class ParticleSystemComponentElement extends ComponentElement {
    /** @ignore */
    constructor() {
        super('particlesystem');
        this._asset = '';
    }
    getInitialComponentData() {
        var _a;
        const asset = AssetElement.get(this._asset);
        if (!asset) {
            return {};
        }
        if (asset.resource.colorMapAsset) {
            const id = asset.resource.colorMapAsset;
            const colorMapAsset = (_a = AssetElement.get(id)) === null || _a === void 0 ? void 0 : _a.id;
            if (colorMapAsset) {
                asset.resource.colorMapAsset = colorMapAsset;
            }
        }
        return asset.resource;
    }
    /**
     * Gets the underlying PlayCanvas particle system component.
     * @returns The particle system component.
     */
    get component() {
        return super.component;
    }
    applyConfig(resource) {
        if (!this.component) {
            return;
        }
        // Set all the config properties on the component
        for (const key in resource) {
            if (resource.hasOwnProperty(key)) {
                this.component[key] = resource[key];
            }
        }
    }
    async _loadAsset() {
        var _a;
        const appElement = await ((_a = this.closestApp) === null || _a === void 0 ? void 0 : _a.ready());
        const app = appElement === null || appElement === void 0 ? void 0 : appElement.app;
        const asset = AssetElement.get(this._asset);
        if (!asset) {
            return;
        }
        if (asset.loaded) {
            this.applyConfig(asset.resource);
        }
        else {
            asset.once('load', () => {
                this.applyConfig(asset.resource);
            });
            app.assets.load(asset);
        }
    }
    /**
     * Sets the id of the `pc-asset` to use for the model.
     * @param value - The asset ID.
     */
    set asset(value) {
        this._asset = value;
        if (this.isConnected) {
            this._loadAsset();
        }
    }
    /**
     * Gets the id of the `pc-asset` to use for the model.
     * @returns The asset ID.
     */
    get asset() {
        return this._asset;
    }
    // Control methods
    /**
     * Starts playing the particle system
     */
    play() {
        if (this.component) {
            this.component.play();
        }
    }
    /**
     * Pauses the particle system
     */
    pause() {
        if (this.component) {
            this.component.pause();
        }
    }
    /**
     * Resets the particle system
     */
    reset() {
        if (this.component) {
            this.component.reset();
        }
    }
    /**
     * Stops the particle system
     */
    stop() {
        if (this.component) {
            this.component.stop();
        }
    }
    static get observedAttributes() {
        return [
            ...super.observedAttributes,
            'asset'
        ];
    }
    attributeChangedCallback(name, _oldValue, newValue) {
        super.attributeChangedCallback(name, _oldValue, newValue);
        switch (name) {
            case 'asset':
                this.asset = newValue;
                break;
        }
    }
}
customElements.define('pc-particles', ParticleSystemComponentElement);

/**
 * The MaterialElement interface provides properties and methods for manipulating
 * {@link https://developer.playcanvas.com/user-manual/engine/web-components/tags/pc-material/ | `<pc-material>`} elements.
 * The MaterialElement interface also inherits the properties and methods of the
 * {@link HTMLElement} interface.
 */
class MaterialElement extends HTMLElement {
    constructor() {
        super(...arguments);
        this._diffuse = new Color(1, 1, 1);
        this._diffuseMap = '';
        this._metalnessMap = '';
        this._normalMap = '';
        this._roughnessMap = '';
        this.material = null;
    }
    createMaterial() {
        this.material = new StandardMaterial();
        this.material.glossInvert = false;
        this.material.useMetalness = false;
        this.material.diffuse = this._diffuse;
        this.diffuseMap = this._diffuseMap;
        this.metalnessMap = this._metalnessMap;
        this.normalMap = this._normalMap;
        this.roughnessMap = this._roughnessMap;
        this.material.update();
    }
    disconnectedCallback() {
        if (this.material) {
            this.material.destroy();
            this.material = null;
        }
    }
    setMap(map, property) {
        if (this.material) {
            const asset = AssetElement.get(map);
            if (asset) {
                if (asset.loaded) {
                    this.material[property] = asset.resource;
                    this.material[property].anisotropy = 4;
                }
                else {
                    asset.once('load', () => {
                        this.material[property] = asset.resource;
                        this.material[property].anisotropy = 4;
                        this.material.update();
                    });
                }
            }
        }
    }
    set diffuse(value) {
        this._diffuse = value;
        if (this.material) {
            this.material.diffuse = value;
        }
    }
    get diffuse() {
        return this._diffuse;
    }
    set diffuseMap(value) {
        this._diffuseMap = value;
        this.setMap(value, 'diffuseMap');
    }
    get diffuseMap() {
        return this._diffuseMap;
    }
    set metalnessMap(value) {
        this._metalnessMap = value;
        this.setMap(value, 'metalnessMap');
    }
    get metalnessMap() {
        return this._metalnessMap;
    }
    set normalMap(value) {
        this._normalMap = value;
        this.setMap(value, 'normalMap');
    }
    get normalMap() {
        return this._normalMap;
    }
    set roughnessMap(value) {
        this._roughnessMap = value;
        this.setMap(value, 'glossMap');
    }
    get roughnessMap() {
        return this._roughnessMap;
    }
    static get(id) {
        const materialElement = document.querySelector(`pc-material[id="${id}"]`);
        return materialElement === null || materialElement === void 0 ? void 0 : materialElement.material;
    }
    static get observedAttributes() {
        return ['diffuse', 'diffuse-map', 'metalness-map', 'normal-map', 'roughness-map'];
    }
    attributeChangedCallback(name, _oldValue, newValue) {
        switch (name) {
            case 'diffuse':
                this.diffuse = parseColor(newValue);
                break;
            case 'diffuse-map':
                this.diffuseMap = newValue;
                break;
            case 'metalness-map':
                this.metalnessMap = newValue;
                break;
            case 'normal-map':
                this.normalMap = newValue;
                break;
            case 'roughness-map':
                this.roughnessMap = newValue;
                break;
        }
    }
}
customElements.define('pc-material', MaterialElement);

/**
 * The RenderComponentElement interface provides properties and methods for manipulating
 * {@link https://developer.playcanvas.com/user-manual/engine/web-components/tags/pc-render/ | `<pc-render>`} elements.
 * The RenderComponentElement interface also inherits the properties and methods of the
 * {@link HTMLElement} interface.
 *
 * @category Components
 */
class RenderComponentElement extends ComponentElement {
    /** @ignore */
    constructor() {
        super('render');
        this._castShadows = true;
        this._material = '';
        this._receiveShadows = true;
        this._type = 'asset';
    }
    getInitialComponentData() {
        return {
            type: this._type,
            castShadows: this._castShadows,
            material: MaterialElement.get(this._material),
            receiveShadows: this._receiveShadows
        };
    }
    /**
     * Gets the underlying PlayCanvas render component.
     * @returns The render component.
     */
    get component() {
        return super.component;
    }
    /**
     * Sets the type of the render component.
     * @param value - The type.
     */
    set type(value) {
        this._type = value;
        if (this.component) {
            this.component.type = value;
        }
    }
    /**
     * Gets the type of the render component.
     * @returns The type.
     */
    get type() {
        return this._type;
    }
    /**
     * Sets the cast shadows flag of the render component.
     * @param value - The cast shadows flag.
     */
    set castShadows(value) {
        this._castShadows = value;
        if (this.component) {
            this.component.castShadows = value;
        }
    }
    /**
     * Gets the cast shadows flag of the render component.
     * @returns The cast shadows flag.
     */
    get castShadows() {
        return this._castShadows;
    }
    /**
     * Sets the material of the render component.
     * @param value - The id of the material asset to use.
     */
    set material(value) {
        this._material = value;
        if (this.component) {
            this.component.material = MaterialElement.get(value);
        }
    }
    /**
     * Gets the id of the material asset used by the render component.
     * @returns The id of the material asset.
     */
    get material() {
        return this._material;
    }
    /**
     * Sets the receive shadows flag of the render component.
     * @param value - The receive shadows flag.
     */
    set receiveShadows(value) {
        this._receiveShadows = value;
        if (this.component) {
            this.component.receiveShadows = value;
        }
    }
    /**
     * Gets the receive shadows flag of the render component.
     * @returns The receive shadows flag.
     */
    get receiveShadows() {
        return this._receiveShadows;
    }
    static get observedAttributes() {
        return [...super.observedAttributes, 'cast-shadows', 'material', 'receive-shadows', 'type'];
    }
    attributeChangedCallback(name, _oldValue, newValue) {
        super.attributeChangedCallback(name, _oldValue, newValue);
        switch (name) {
            case 'cast-shadows':
                this.castShadows = newValue !== 'false';
                break;
            case 'material':
                this.material = newValue;
                break;
            case 'receive-shadows':
                this.receiveShadows = newValue !== 'false';
                break;
            case 'type':
                this.type = newValue;
                break;
        }
    }
}
customElements.define('pc-render', RenderComponentElement);

/**
 * The RigidBodyComponentElement interface provides properties and methods for manipulating
 * {@link https://developer.playcanvas.com/user-manual/engine/web-components/tags/pc-rigidbody/ | `<pc-rigidbody>`} elements.
 * The RigidBodyComponentElement interface also inherits the properties and methods of the
 * {@link HTMLElement} interface.
 *
 * @category Components
 */
class RigidBodyComponentElement extends ComponentElement {
    /** @ignore */
    constructor() {
        super('rigidbody');
        /**
         * The angular damping of the rigidbody.
         */
        this._angularDamping = 0;
        /**
         * The angular factor of the rigidbody.
         */
        this._angularFactor = new Vec3(1, 1, 1);
        /**
         * The friction of the rigidbody.
         */
        this._friction = 0.5;
        /**
         * The linear damping of the rigidbody.
         */
        this._linearDamping = 0;
        /**
         * The linear factor of the rigidbody.
         */
        this._linearFactor = new Vec3(1, 1, 1);
        /**
         * The mass of the rigidbody.
         */
        this._mass = 1;
        /**
         * The restitution of the rigidbody.
         */
        this._restitution = 0;
        /**
         * The rolling friction of the rigidbody.
         */
        this._rollingFriction = 0;
        /**
         * The type of the rigidbody.
         */
        this._type = 'static';
    }
    getInitialComponentData() {
        return {
            angularDamping: this._angularDamping,
            angularFactor: this._angularFactor,
            friction: this._friction,
            linearDamping: this._linearDamping,
            linearFactor: this._linearFactor,
            mass: this._mass,
            restitution: this._restitution,
            rollingFriction: this._rollingFriction,
            type: this._type
        };
    }
    /**
     * Gets the underlying PlayCanvas rigidbody component.
     * @returns The rigidbody component.
     */
    get component() {
        return super.component;
    }
    set angularDamping(value) {
        this._angularDamping = value;
        if (this.component) {
            this.component.angularDamping = value;
        }
    }
    get angularDamping() {
        return this._angularDamping;
    }
    set angularFactor(value) {
        this._angularFactor = value;
        if (this.component) {
            this.component.angularFactor = value;
        }
    }
    get angularFactor() {
        return this._angularFactor;
    }
    set friction(value) {
        this._friction = value;
        if (this.component) {
            this.component.friction = value;
        }
    }
    get friction() {
        return this._friction;
    }
    set linearDamping(value) {
        this._linearDamping = value;
        if (this.component) {
            this.component.linearDamping = value;
        }
    }
    get linearDamping() {
        return this._linearDamping;
    }
    set linearFactor(value) {
        this._linearFactor = value;
        if (this.component) {
            this.component.linearFactor = value;
        }
    }
    get linearFactor() {
        return this._linearFactor;
    }
    set mass(value) {
        this._mass = value;
        if (this.component) {
            this.component.mass = value;
        }
    }
    get mass() {
        return this._mass;
    }
    set restitution(value) {
        this._restitution = value;
        if (this.component) {
            this.component.restitution = value;
        }
    }
    get restitution() {
        return this._restitution;
    }
    set rollingFriction(value) {
        this._rollingFriction = value;
        if (this.component) {
            this.component.rollingFriction = value;
        }
    }
    get rollingFriction() {
        return this._rollingFriction;
    }
    set type(value) {
        this._type = value;
        if (this.component) {
            this.component.type = value;
        }
    }
    get type() {
        return this._type;
    }
    static get observedAttributes() {
        return [...super.observedAttributes, 'angular-damping', 'angular-factor', 'friction', 'linear-damping', 'linear-factor', 'mass', 'restitution', 'rolling-friction', 'type'];
    }
    attributeChangedCallback(name, _oldValue, newValue) {
        super.attributeChangedCallback(name, _oldValue, newValue);
        switch (name) {
            case 'angular-damping':
                this.angularDamping = parseFloat(newValue);
                break;
            case 'angular-factor':
                this.angularFactor = parseVec3(newValue);
                break;
            case 'friction':
                this.friction = parseFloat(newValue);
                break;
            case 'linear-damping':
                this.linearDamping = parseFloat(newValue);
                break;
            case 'linear-factor':
                this.linearFactor = parseVec3(newValue);
                break;
            case 'mass':
                this.mass = parseFloat(newValue);
                break;
            case 'restitution':
                this.restitution = parseFloat(newValue);
                break;
            case 'rolling-friction':
                this.rollingFriction = parseFloat(newValue);
                break;
            case 'type':
                this.type = newValue;
                break;
        }
    }
}
customElements.define('pc-rigidbody', RigidBodyComponentElement);

/**
 * The ScreenComponentElement interface provides properties and methods for manipulating
 * {@link https://developer.playcanvas.com/user-manual/engine/web-components/tags/pc-screen/ | `<pc-screen>`} elements.
 * The ScreenComponentElement interface also inherits the properties and methods of the
 * {@link HTMLElement} interface.
 *
 * @category Components
 */
class ScreenComponentElement extends ComponentElement {
    /** @ignore */
    constructor() {
        super('screen');
        this._screenSpace = false;
        this._resolution = new Vec2(640, 320);
        this._referenceResolution = new Vec2(640, 320);
        this._priority = 0;
        this._blend = false;
        this._scaleBlend = 0.5;
    }
    getInitialComponentData() {
        return {
            priority: this._priority,
            referenceResolution: this._referenceResolution,
            resolution: this._resolution,
            scaleBlend: this._scaleBlend,
            scaleMode: this._blend ? SCALEMODE_BLEND : SCALEMODE_NONE,
            screenSpace: this._screenSpace
        };
    }
    /**
     * Gets the underlying PlayCanvas screen component.
     * @returns The screen component.
     */
    get component() {
        return super.component;
    }
    set priority(value) {
        this._priority = value;
        if (this.component) {
            this.component.priority = this._priority;
        }
    }
    get priority() {
        return this._priority;
    }
    set referenceResolution(value) {
        this._referenceResolution = value;
        if (this.component) {
            this.component.referenceResolution = this._referenceResolution;
        }
    }
    get referenceResolution() {
        return this._referenceResolution;
    }
    set resolution(value) {
        this._resolution = value;
        if (this.component) {
            this.component.resolution = this._resolution;
        }
    }
    get resolution() {
        return this._resolution;
    }
    set scaleBlend(value) {
        this._scaleBlend = value;
        if (this.component) {
            this.component.scaleBlend = this._scaleBlend;
        }
    }
    get scaleBlend() {
        return this._scaleBlend;
    }
    set blend(value) {
        this._blend = value;
        if (this.component) {
            this.component.scaleMode = this._blend ? SCALEMODE_BLEND : SCALEMODE_NONE;
        }
    }
    get blend() {
        return this._blend;
    }
    set screenSpace(value) {
        this._screenSpace = value;
        if (this.component) {
            this.component.screenSpace = this._screenSpace;
        }
    }
    get screenSpace() {
        return this._screenSpace;
    }
    static get observedAttributes() {
        return [
            ...super.observedAttributes,
            'blend',
            'screen-space',
            'resolution',
            'reference-resolution',
            'priority',
            'scale-blend'
        ];
    }
    attributeChangedCallback(name, _oldValue, newValue) {
        super.attributeChangedCallback(name, _oldValue, newValue);
        switch (name) {
            case 'priority':
                this.priority = parseInt(newValue, 10);
                break;
            case 'reference-resolution':
                this.referenceResolution = parseVec2(newValue);
                break;
            case 'resolution':
                this.resolution = parseVec2(newValue);
                break;
            case 'scale-blend':
                this.scaleBlend = parseFloat(newValue);
                break;
            case 'blend':
                this.blend = this.hasAttribute('blend');
                break;
            case 'screen-space':
                this.screenSpace = this.hasAttribute('screen-space');
                break;
        }
    }
}
customElements.define('pc-screen', ScreenComponentElement);

/**
 * The ScriptComponentElement interface provides properties and methods for manipulating
 * {@link https://developer.playcanvas.com/user-manual/engine/web-components/tags/pc-scripts/ | `<pc-scripts>`} elements.
 * The ScriptComponentElement interface also inherits the properties and methods of the
 * {@link HTMLElement} interface.
 *
 * @category Components
 */
class ScriptComponentElement extends ComponentElement {
    /** @ignore */
    constructor() {
        super('script');
        // Create mutation observer to watch for child script elements
        this.observer = new MutationObserver(this.handleMutations.bind(this));
        this.observer.observe(this, {
            childList: true
        });
        // Listen for script attribute and enable changes
        this.addEventListener('scriptattributeschange', this.handleScriptAttributesChange.bind(this));
        this.addEventListener('scriptenablechange', this.handleScriptEnableChange.bind(this));
    }
    initComponent() {
        // Handle initial script elements
        this.querySelectorAll(':scope > pc-script').forEach((scriptElement) => {
            const scriptName = scriptElement.getAttribute('name');
            const attributes = scriptElement.getAttribute('attributes');
            if (scriptName) {
                this.createScript(scriptName, attributes);
            }
        });
    }
    /**
     * Recursively converts raw attribute data into proper PlayCanvas types. Supported conversions:
     * - "asset:assetId" → resolves to an Asset instance
     * - "entity:entityId" → resolves to an Entity instance
     * - "vec2:1,2" → new Vec2(1,2)
     * - "vec3:1,2,3" → new Vec3(1,2,3)
     * - "vec4:1,2,3,4" → new Vec4(1,2,3,4)
     * - "color:1,0.5,0.5,1" → new Color(1,0.5,0.5,1)
     * @param item - The item to convert.
     * @returns The converted item.
     */
    convertAttributes(item) {
        if (typeof item === 'string') {
            if (item.startsWith('asset:')) {
                const assetId = item.slice(6);
                const assetElement = document.querySelector(`pc-asset#${assetId}`);
                if (assetElement) {
                    return assetElement.asset;
                }
            }
            if (item.startsWith('entity:')) {
                const entityId = item.slice(7);
                const entityElement = document.querySelector(`pc-entity[name="${entityId}"]`);
                if (entityElement) {
                    return entityElement.entity;
                }
            }
            if (item.startsWith('vec2:')) {
                const parts = item.slice(5).split(',').map(Number);
                if (parts.length === 2 && parts.every(v => !isNaN(v))) {
                    return new Vec2(parts[0], parts[1]);
                }
            }
            if (item.startsWith('vec3:')) {
                const parts = item.slice(5).split(',').map(Number);
                if (parts.length === 3 && parts.every(v => !isNaN(v))) {
                    return new Vec3(parts[0], parts[1], parts[2]);
                }
            }
            if (item.startsWith('vec4:')) {
                const parts = item.slice(5).split(',').map(Number);
                if (parts.length === 4 && parts.every(v => !isNaN(v))) {
                    return new Vec4(parts[0], parts[1], parts[2], parts[3]);
                }
            }
            if (item.startsWith('color:')) {
                const parts = item.slice(6).split(',').map(Number);
                if (parts.length === 4 && parts.every(v => !isNaN(v))) {
                    return new Color(parts[0], parts[1], parts[2], parts[3]);
                }
            }
            return item;
        }
        if (Array.isArray(item)) {
            // If it's an array of objects, convert each element individually.
            if (item.length > 0 && typeof item[0] === 'object') {
                return item.map((el) => this.convertAttributes(el));
            }
            // Otherwise, leave the numeric array unchanged but process each element.
            return item.map((el) => this.convertAttributes(el));
        }
        if (item && typeof item === 'object') {
            const result = {};
            for (const key in item) {
                result[key] = this.convertAttributes(item[key]);
            }
            return result;
        }
        return item;
    }
    /**
     * Preprocess the attributes object by converting its values.
     * @param attrs - The attributes object to preprocess.
     * @returns The preprocessed attributes object.
     */
    preprocessAttributes(attrs) {
        return this.convertAttributes(attrs);
    }
    /**
     * Recursively merge properties from source into target.
     * @param target - The target object to merge into.
     * @param source - The source object to merge from.
     * @returns The merged object.
     */
    mergeDeep(target, source) {
        for (const key in source) {
            if (source[key] &&
                typeof source[key] === 'object' &&
                !Array.isArray(source[key])) {
                if (!target[key] || typeof target[key] !== 'object') {
                    target[key] = {};
                }
                this.mergeDeep(target[key], source[key]);
            }
            else {
                target[key] = source[key];
            }
        }
        return target;
    }
    /**
     * Update script attributes by merging preprocessed values into the script.
     * @param script - The script to update.
     * @param attributes - The attributes to merge into the script.
     */
    applyAttributes(script, attributes) {
        try {
            const attributesObject = attributes ? JSON.parse(attributes) : {};
            const converted = this.convertAttributes(attributesObject);
            this.mergeDeep(script, converted);
        }
        catch (error) {
            console.error(`Error parsing attributes JSON string ${attributes}:`, error);
        }
    }
    handleScriptAttributesChange(event) {
        const scriptElement = event.target;
        const scriptName = scriptElement.getAttribute('name');
        if (!scriptName || !this.component)
            return;
        const script = this.component.get(scriptName);
        if (script) {
            this.applyAttributes(script, event.detail.attributes);
        }
    }
    handleScriptEnableChange(event) {
        const scriptElement = event.target;
        const scriptName = scriptElement.getAttribute('name');
        if (!scriptName || !this.component)
            return;
        const script = this.component.get(scriptName);
        if (script) {
            script.enabled = event.detail.enabled;
        }
    }
    createScript(name, attributes) {
        if (!this.component)
            return null;
        let attributesObject = {};
        if (attributes) {
            try {
                attributesObject = JSON.parse(attributes);
                // Preprocess attributes: convert arrays or strings into vectors, colors, asset references, etc.
                attributesObject = this.preprocessAttributes(attributesObject);
            }
            catch (error) {
                console.error(`Error parsing attributes JSON string ${attributes}:`, error);
            }
        }
        return this.component.create(name, {
            properties: attributesObject
        });
    }
    destroyScript(name) {
        if (!this.component)
            return;
        this.component.destroy(name);
    }
    handleMutations(mutations) {
        for (const mutation of mutations) {
            // Handle added nodes
            mutation.addedNodes.forEach((node) => {
                if (node instanceof HTMLElement && node.tagName.toLowerCase() === 'pc-script') {
                    const scriptName = node.getAttribute('name');
                    const attributes = node.getAttribute('attributes');
                    if (scriptName) {
                        this.createScript(scriptName, attributes);
                    }
                }
            });
            // Handle removed nodes
            mutation.removedNodes.forEach((node) => {
                if (node instanceof HTMLElement && node.tagName.toLowerCase() === 'pc-script') {
                    const scriptName = node.getAttribute('name');
                    if (scriptName) {
                        this.destroyScript(scriptName);
                    }
                }
            });
        }
    }
    disconnectedCallback() {
        var _a;
        this.observer.disconnect();
        (_a = super.disconnectedCallback) === null || _a === void 0 ? void 0 : _a.call(this);
    }
    /**
     * Gets the underlying PlayCanvas script component.
     * @returns The script component.
     */
    get component() {
        return super.component;
    }
}
customElements.define('pc-scripts', ScriptComponentElement);

/**
 * The ScriptElement interface provides properties and methods for manipulating
 * `<pc-script>` elements. The ScriptElement interface also inherits the properties and
 * methods of the {@link HTMLElement} interface.
 */
class ScriptElement extends HTMLElement {
    constructor() {
        super(...arguments);
        this._attributes = '{}';
        this._enabled = true;
        this._name = '';
    }
    /**
     * Sets the attributes of the script.
     * @param value - The attributes of the script.
     */
    set scriptAttributes(value) {
        this._attributes = value;
        this.dispatchEvent(new CustomEvent('scriptattributeschange', {
            detail: { attributes: value },
            bubbles: true
        }));
    }
    /**
     * Gets the attributes of the script.
     * @returns The attributes of the script.
     */
    get scriptAttributes() {
        return this._attributes;
    }
    /**
     * Sets the enabled state of the script.
     * @param value - The enabled state of the script.
     */
    set enabled(value) {
        this._enabled = value;
        this.dispatchEvent(new CustomEvent('scriptenablechange', {
            detail: { enabled: value },
            bubbles: true
        }));
    }
    /**
     * Gets the enabled state of the script.
     * @returns The enabled state of the script.
     */
    get enabled() {
        return this._enabled;
    }
    /**
     * Sets the name of the script to create.
     * @param value - The name.
     */
    set name(value) {
        this._name = value;
    }
    /**
     * Gets the name of the script.
     * @returns The name.
     */
    get name() {
        return this._name;
    }
    static get observedAttributes() {
        return ['attributes', 'enabled', 'name'];
    }
    attributeChangedCallback(name, _oldValue, newValue) {
        switch (name) {
            case 'attributes':
                this.scriptAttributes = newValue;
                break;
            case 'enabled':
                this.enabled = newValue !== 'false';
                break;
            case 'name':
                this.name = newValue;
                break;
        }
    }
}
customElements.define('pc-script', ScriptElement);

/**
 * The SoundComponentElement interface provides properties and methods for manipulating
 * {@link https://developer.playcanvas.com/user-manual/engine/web-components/tags/pc-sounds/ | `<pc-sounds>`} elements.
 * The SoundComponentElement interface also inherits the properties and methods of the
 * {@link HTMLElement} interface.
 *
 * @category Components
 */
class SoundComponentElement extends ComponentElement {
    /** @ignore */
    constructor() {
        super('sound');
        this._distanceModel = 'linear';
        this._maxDistance = 10000;
        this._pitch = 1;
        this._positional = false;
        this._refDistance = 1;
        this._rollOffFactor = 1;
        this._volume = 1;
    }
    getInitialComponentData() {
        return {
            distanceModel: this._distanceModel,
            maxDistance: this._maxDistance,
            pitch: this._pitch,
            positional: this._positional,
            refDistance: this._refDistance,
            rollOffFactor: this._rollOffFactor,
            volume: this._volume
        };
    }
    /**
     * Gets the underlying PlayCanvas sound component.
     * @returns The sound component.
     */
    get component() {
        return super.component;
    }
    /**
     * Sets which algorithm to use to reduce the volume of the sound as it moves away from the listener.
     * @param value - The distance model.
     */
    set distanceModel(value) {
        this._distanceModel = value;
        if (this.component) {
            this.component.distanceModel = value;
        }
    }
    /**
     * Gets which algorithm to use to reduce the volume of the sound as it moves away from the listener.
     * @returns The distance model.
     */
    get distanceModel() {
        return this._distanceModel;
    }
    /**
     * Sets the maximum distance from the listener at which audio falloff stops.
     * @param value - The max distance.
     */
    set maxDistance(value) {
        this._maxDistance = value;
        if (this.component) {
            this.component.maxDistance = value;
        }
    }
    /**
     * Gets the maximum distance from the listener at which audio falloff stops.
     * @returns The max distance.
     */
    get maxDistance() {
        return this._maxDistance;
    }
    /**
     * Sets the pitch of the sound.
     * @param value - The pitch.
     */
    set pitch(value) {
        this._pitch = value;
        if (this.component) {
            this.component.pitch = value;
        }
    }
    /**
     * Gets the pitch of the sound.
     * @returns The pitch.
     */
    get pitch() {
        return this._pitch;
    }
    /**
     * Sets the positional flag of the sound.
     * @param value - The positional flag.
     */
    set positional(value) {
        this._positional = value;
        if (this.component) {
            this.component.positional = value;
        }
    }
    /**
     * Gets the positional flag of the sound.
     * @returns The positional flag.
     */
    get positional() {
        return this._positional;
    }
    /**
     * Sets the reference distance for reducing volume as the sound source moves further from the listener. Defaults to 1.
     * @param value - The ref distance.
     */
    set refDistance(value) {
        this._refDistance = value;
        if (this.component) {
            this.component.refDistance = value;
        }
    }
    /**
     * Gets the reference distance for reducing volume as the sound source moves further from the listener.
     * @returns The ref distance.
     */
    get refDistance() {
        return this._refDistance;
    }
    /**
     * Sets the factor used in the falloff equation. Defaults to 1.
     * @param value - The roll-off factor.
     */
    set rollOffFactor(value) {
        this._rollOffFactor = value;
        if (this.component) {
            this.component.rollOffFactor = value;
        }
    }
    /**
     * Gets the factor used in the falloff equation.
     * @returns The roll-off factor.
     */
    get rollOffFactor() {
        return this._rollOffFactor;
    }
    /**
     * Sets the volume of the sound.
     * @param value - The volume.
     */
    set volume(value) {
        this._volume = value;
        if (this.component) {
            this.component.volume = value;
        }
    }
    /**
     * Gets the volume of the sound.
     * @returns The volume.
     */
    get volume() {
        return this._volume;
    }
    static get observedAttributes() {
        return [
            ...super.observedAttributes,
            'distance-model',
            'max-distance',
            'pitch',
            'positional',
            'ref-distance',
            'roll-off-factor',
            'volume'
        ];
    }
    attributeChangedCallback(name, _oldValue, newValue) {
        super.attributeChangedCallback(name, _oldValue, newValue);
        switch (name) {
            case 'distance-model':
                this.distanceModel = newValue;
                break;
            case 'max-distance':
                this.maxDistance = parseFloat(newValue);
                break;
            case 'pitch':
                this.pitch = parseFloat(newValue);
                break;
            case 'positional':
                this.positional = this.hasAttribute('positional');
                break;
            case 'ref-distance':
                this.refDistance = parseFloat(newValue);
                break;
            case 'roll-off-factor':
                this.rollOffFactor = parseFloat(newValue);
                break;
            case 'volume':
                this.volume = parseFloat(newValue);
                break;
        }
    }
}
customElements.define('pc-sounds', SoundComponentElement);

/**
 * The SoundSlotElement interface provides properties and methods for manipulating
 * `<pc-sound>` elements. The SoundSlotElement interface also inherits the properties and
 * methods of the {@link AsyncElement} interface.
 */
class SoundSlotElement extends AsyncElement {
    constructor() {
        super(...arguments);
        this._asset = '';
        this._autoPlay = false;
        this._duration = null;
        this._loop = false;
        this._name = '';
        this._overlap = false;
        this._pitch = 1;
        this._startTime = 0;
        this._volume = 1;
        /**
         * The sound slot.
         */
        this.soundSlot = null;
    }
    async connectedCallback() {
        var _a;
        await ((_a = this.soundElement) === null || _a === void 0 ? void 0 : _a.ready());
        const options = {
            autoPlay: this._autoPlay,
            loop: this._loop,
            overlap: this._overlap,
            pitch: this._pitch,
            startTime: this._startTime,
            volume: this._volume
        };
        if (this._duration) {
            options.duration = this._duration;
        }
        this.soundSlot = this.soundElement.component.addSlot(this._name, options);
        this.asset = this._asset;
        this._onReady();
    }
    disconnectedCallback() {
        this.soundElement.component.removeSlot(this._name);
    }
    get soundElement() {
        const soundElement = this.parentElement;
        if (!(soundElement instanceof SoundComponentElement)) {
            console.warn('pc-sound-slot must be a direct child of a pc-sound element');
            return null;
        }
        return soundElement;
    }
    /**
     * Sets the id of the `pc-asset` to use for the sound slot.
     * @param value - The asset.
     */
    set asset(value) {
        var _a;
        this._asset = value;
        if (this.soundSlot) {
            const id = (_a = AssetElement.get(value)) === null || _a === void 0 ? void 0 : _a.id;
            if (id) {
                this.soundSlot.asset = id;
            }
        }
    }
    /**
     * Gets the id of the `pc-asset` to use for the sound slot.
     * @returns The asset.
     */
    get asset() {
        return this._asset;
    }
    /**
     * Sets the auto play flag of the sound slot.
     * @param value - The auto play flag.
     */
    set autoPlay(value) {
        this._autoPlay = value;
        if (this.soundSlot) {
            this.soundSlot.autoPlay = value;
        }
    }
    /**
     * Gets the auto play flag of the sound slot.
     * @returns The auto play flag.
     */
    get autoPlay() {
        return this._autoPlay;
    }
    /**
     * Sets the duration of the sound slot.
     * @param value - The duration.
     */
    set duration(value) {
        this._duration = value;
        if (this.soundSlot) {
            this.soundSlot.duration = value;
        }
    }
    /**
     * Gets the duration of the sound slot.
     * @returns The duration.
     */
    get duration() {
        return this._duration;
    }
    /**
     * Sets the loop flag of the sound slot.
     * @param value - The loop flag.
     */
    set loop(value) {
        this._loop = value;
        if (this.soundSlot) {
            this.soundSlot.loop = value;
        }
    }
    /**
     * Gets the loop flag of the sound slot.
     * @returns The loop flag.
     */
    get loop() {
        return this._loop;
    }
    /**
     * Sets the name of the sound slot.
     * @param value - The name.
     */
    set name(value) {
        this._name = value;
        if (this.soundSlot) {
            this.soundSlot.name = value;
        }
    }
    /**
     * Gets the name of the sound slot.
     * @returns The name.
     */
    get name() {
        return this._name;
    }
    /**
     * Sets the overlap flag of the sound slot.
     * @param value - The overlap flag.
     */
    set overlap(value) {
        this._overlap = value;
        if (this.soundSlot) {
            this.soundSlot.overlap = value;
        }
    }
    /**
     * Gets the overlap flag of the sound slot.
     * @returns The overlap flag.
     */
    get overlap() {
        return this._overlap;
    }
    /**
     * Sets the pitch of the sound slot.
     * @param value - The pitch.
     */
    set pitch(value) {
        this._pitch = value;
        if (this.soundSlot) {
            this.soundSlot.pitch = value;
        }
    }
    /**
     * Gets the pitch of the sound slot.
     * @returns The pitch.
     */
    get pitch() {
        return this._pitch;
    }
    /**
     * Sets the start time of the sound slot.
     * @param value - The start time.
     */
    set startTime(value) {
        this._startTime = value;
        if (this.soundSlot) {
            this.soundSlot.startTime = value;
        }
    }
    /**
     * Gets the start time of the sound slot.
     * @returns The start time.
     */
    get startTime() {
        return this._startTime;
    }
    /**
     * Sets the volume of the sound slot.
     * @param value - The volume.
     */
    set volume(value) {
        this._volume = value;
        if (this.soundSlot) {
            this.soundSlot.volume = value;
        }
    }
    /**
     * Gets the volume of the sound slot.
     * @returns The volume.
     */
    get volume() {
        return this._volume;
    }
    static get observedAttributes() {
        return ['asset', 'auto-play', 'duration', 'loop', 'name', 'overlap', 'pitch', 'start-time', 'volume'];
    }
    attributeChangedCallback(name, _oldValue, newValue) {
        switch (name) {
            case 'asset':
                this.asset = newValue;
                break;
            case 'auto-play':
                this.autoPlay = this.hasAttribute('auto-play');
                break;
            case 'duration':
                this.duration = parseFloat(newValue);
                break;
            case 'loop':
                this.loop = this.hasAttribute('loop');
                break;
            case 'name':
                this.name = newValue;
                break;
            case 'overlap':
                this.overlap = this.hasAttribute('overlap');
                break;
            case 'pitch':
                this.pitch = parseFloat(newValue);
                break;
            case 'start-time':
                this.startTime = parseFloat(newValue);
                break;
            case 'volume':
                this.volume = parseFloat(newValue);
                break;
        }
    }
}
customElements.define('pc-sound', SoundSlotElement);

/**
 * The SplatComponentElement interface provides properties and methods for manipulating
 * {@link https://developer.playcanvas.com/user-manual/engine/web-components/tags/pc-splat/ | `<pc-splat>`} elements.
 * The SplatComponentElement interface also inherits the properties and methods of the
 * {@link HTMLElement} interface.
 *
 * @category Components
 */
class SplatComponentElement extends ComponentElement {
    /** @ignore */
    constructor() {
        super('gsplat');
        this._asset = '';
    }
    getInitialComponentData() {
        return {
            asset: AssetElement.get(this._asset)
        };
    }
    /**
     * Gets the underlying PlayCanvas splat component.
     * @returns The splat component.
     */
    get component() {
        return super.component;
    }
    /**
     * Sets id of the `pc-asset` to use for the splat.
     * @param value - The asset ID.
     */
    set asset(value) {
        this._asset = value;
        const asset = AssetElement.get(value);
        if (this.component && asset) {
            this.component.asset = asset;
        }
    }
    /**
     * Gets the id of the `pc-asset` to use for the splat.
     * @returns The asset ID.
     */
    get asset() {
        return this._asset;
    }
    static get observedAttributes() {
        return [...super.observedAttributes, 'asset'];
    }
    attributeChangedCallback(name, _oldValue, newValue) {
        super.attributeChangedCallback(name, _oldValue, newValue);
        switch (name) {
            case 'asset':
                this.asset = newValue;
                break;
        }
    }
}
customElements.define('pc-splat', SplatComponentElement);

/**
 * The ModelElement interface provides properties and methods for manipulating
 * {@link https://developer.playcanvas.com/user-manual/engine/web-components/tags/pc-model/ | `<pc-model>`} elements.
 * The ModelElement interface also inherits the properties and methods of the
 * {@link HTMLElement} interface.
 */
class ModelElement extends AsyncElement {
    constructor() {
        super(...arguments);
        this._asset = '';
        this._entity = null;
    }
    connectedCallback() {
        this._loadModel();
        this._onReady();
    }
    disconnectedCallback() {
        this._unloadModel();
    }
    _instantiate(container) {
        this._entity = container.instantiateRenderEntity();
        // @ts-ignore
        if (container.animations.length > 0) {
            this._entity.addComponent('anim');
            // @ts-ignore
            this._entity.anim.assignAnimation('animation', container.animations[0].resource);
        }
        const parentEntityElement = this.closestEntity;
        if (parentEntityElement) {
            parentEntityElement.ready().then(() => {
                parentEntityElement.entity.addChild(this._entity);
            });
        }
        else {
            const appElement = this.closestApp;
            if (appElement) {
                appElement.ready().then(() => {
                    appElement.app.root.addChild(this._entity);
                });
            }
        }
    }
    async _loadModel() {
        var _a;
        this._unloadModel();
        const appElement = await ((_a = this.closestApp) === null || _a === void 0 ? void 0 : _a.ready());
        const app = appElement === null || appElement === void 0 ? void 0 : appElement.app;
        const asset = AssetElement.get(this._asset);
        if (!asset) {
            return;
        }
        if (asset.loaded) {
            this._instantiate(asset.resource);
        }
        else {
            asset.once('load', () => {
                this._instantiate(asset.resource);
            });
            app.assets.load(asset);
        }
    }
    _unloadModel() {
        var _a;
        (_a = this._entity) === null || _a === void 0 ? void 0 : _a.destroy();
        this._entity = null;
    }
    /**
     * Sets the id of the `pc-asset` to use for the model.
     * @param value - The asset ID.
     */
    set asset(value) {
        this._asset = value;
        if (this.isConnected) {
            this._loadModel();
        }
    }
    /**
     * Gets the id of the `pc-asset` to use for the model.
     * @returns The asset ID.
     */
    get asset() {
        return this._asset;
    }
    static get observedAttributes() {
        return ['asset'];
    }
    attributeChangedCallback(name, _oldValue, newValue) {
        switch (name) {
            case 'asset':
                this.asset = newValue;
                break;
        }
    }
}
customElements.define('pc-model', ModelElement);

/**
 * The SceneElement interface provides properties and methods for manipulating
 * {@link https://developer.playcanvas.com/user-manual/engine/web-components/tags/pc-scene/ | `<pc-scene>`} elements.
 * The SceneElement interface also inherits the properties and methods of the
 * {@link HTMLElement} interface.
 */
class SceneElement extends AsyncElement {
    constructor() {
        super(...arguments);
        /**
         * The fog type of the scene.
         */
        this._fog = 'none'; // possible values: 'none', 'linear', 'exp', 'exp2'
        /**
         * The color of the fog.
         */
        this._fogColor = new Color(1, 1, 1);
        /**
         * The density of the fog.
         */
        this._fogDensity = 0;
        /**
         * The start distance of the fog.
         */
        this._fogStart = 0;
        /**
         * The end distance of the fog.
         */
        this._fogEnd = 1000;
        /**
         * The gravity of the scene.
         */
        this._gravity = new Vec3(0, -9.81, 0);
        /**
         * The PlayCanvas scene instance.
         */
        this.scene = null;
    }
    async connectedCallback() {
        var _a;
        await ((_a = this.closestApp) === null || _a === void 0 ? void 0 : _a.ready());
        this.scene = this.closestApp.app.scene;
        this.updateSceneSettings();
        this._onReady();
    }
    updateSceneSettings() {
        if (this.scene) {
            this.scene.fog.type = this._fog;
            this.scene.fog.color = this._fogColor;
            this.scene.fog.density = this._fogDensity;
            this.scene.fog.start = this._fogStart;
            this.scene.fog.end = this._fogEnd;
            const appElement = this.parentElement;
            appElement.app.systems.rigidbody.gravity.copy(this._gravity);
        }
    }
    /**
     * Sets the fog type of the scene.
     * @param value - The fog type.
     */
    set fog(value) {
        this._fog = value;
        if (this.scene) {
            this.scene.fog.type = value;
        }
    }
    /**
     * Gets the fog type of the scene.
     * @returns The fog type.
     */
    get fog() {
        return this._fog;
    }
    /**
     * Sets the fog color of the scene.
     * @param value - The fog color.
     */
    set fogColor(value) {
        this._fogColor = value;
        if (this.scene) {
            this.scene.fog.color = value;
        }
    }
    /**
     * Gets the fog color of the scene.
     * @returns The fog color.
     */
    get fogColor() {
        return this._fogColor;
    }
    /**
     * Sets the fog density of the scene.
     * @param value - The fog density.
     */
    set fogDensity(value) {
        this._fogDensity = value;
        if (this.scene) {
            this.scene.fog.density = value;
        }
    }
    /**
     * Gets the fog density of the scene.
     * @returns The fog density.
     */
    get fogDensity() {
        return this._fogDensity;
    }
    /**
     * Sets the fog start distance of the scene.
     * @param value - The fog start distance.
     */
    set fogStart(value) {
        this._fogStart = value;
        if (this.scene) {
            this.scene.fog.start = value;
        }
    }
    /**
     * Gets the fog start distance of the scene.
     * @returns The fog start distance.
     */
    get fogStart() {
        return this._fogStart;
    }
    /**
     * Sets the fog end distance of the scene.
     * @param value - The fog end distance.
     */
    set fogEnd(value) {
        this._fogEnd = value;
        if (this.scene) {
            this.scene.fog.end = value;
        }
    }
    /**
     * Gets the fog end distance of the scene.
     * @returns The fog end distance.
     */
    get fogEnd() {
        return this._fogEnd;
    }
    /**
     * Sets the gravity of the scene.
     * @param value - The gravity.
     */
    set gravity(value) {
        this._gravity = value;
        if (this.scene) {
            const appElement = this.parentElement;
            appElement.app.systems.rigidbody.gravity.copy(value);
        }
    }
    /**
     * Gets the gravity of the scene.
     * @returns The gravity.
     */
    get gravity() {
        return this._gravity;
    }
    static get observedAttributes() {
        return ['fog', 'fog-color', 'fog-density', 'fog-start', 'fog-end', 'gravity'];
    }
    attributeChangedCallback(name, _oldValue, newValue) {
        switch (name) {
            case 'fog':
                this.fog = newValue;
                break;
            case 'fog-color':
                this.fogColor = parseColor(newValue);
                break;
            case 'fog-density':
                this.fogDensity = parseFloat(newValue);
                break;
            case 'fog-start':
                this.fogStart = parseFloat(newValue);
                break;
            case 'fog-end':
                this.fogEnd = parseFloat(newValue);
                break;
            case 'gravity':
                this.gravity = parseVec3(newValue);
                break;
            // ... handle other attributes as well
        }
    }
}
customElements.define('pc-scene', SceneElement);

/**
 * The SkyElement interface provides properties and methods for manipulating
 * `<pc-sky>` elements. The SkyElement interface also inherits the properties and
 * methods of the {@link HTMLElement} interface.
 */
class SkyElement extends AsyncElement {
    constructor() {
        super(...arguments);
        this._asset = '';
        this._center = new Vec3(0, 0.01, 0);
        this._intensity = 1;
        this._rotation = new Vec3();
        this._level = 0;
        this._lighting = false;
        this._scale = new Vec3(100, 100, 100);
        this._type = 'infinite';
        this._scene = null;
    }
    connectedCallback() {
        this._loadSkybox();
        this._onReady();
    }
    disconnectedCallback() {
        this._unloadSkybox();
    }
    _generateSkybox(asset) {
        if (!this._scene)
            return;
        const source = asset.resource;
        const skybox = EnvLighting.generateSkyboxCubemap(source);
        skybox.anisotropy = 4;
        this._scene.skybox = skybox;
        if (this._lighting) {
            const lighting = EnvLighting.generateLightingSource(source);
            const envAtlas = EnvLighting.generateAtlas(lighting);
            this._scene.envAtlas = envAtlas;
        }
        const layer = this._scene.layers.getLayerById(LAYERID_SKYBOX);
        if (layer) {
            layer.enabled = this._type !== 'none';
        }
        this._scene.sky.type = this._type;
        this._scene.sky.node.setLocalScale(this._scale);
        this._scene.sky.center = this._center;
        this._scene.skyboxIntensity = this._intensity;
        this._scene.skyboxMip = this._level;
    }
    async _loadSkybox() {
        var _a;
        const appElement = await ((_a = this.closestApp) === null || _a === void 0 ? void 0 : _a.ready());
        const app = appElement === null || appElement === void 0 ? void 0 : appElement.app;
        if (!app) {
            return;
        }
        const asset = AssetElement.get(this._asset);
        if (!asset) {
            return;
        }
        this._scene = app.scene;
        if (asset.loaded) {
            this._generateSkybox(asset);
        }
        else {
            asset.once('load', () => {
                this._generateSkybox(asset);
            });
            app.assets.load(asset);
        }
    }
    _unloadSkybox() {
        var _a, _b;
        if (!this._scene)
            return;
        (_a = this._scene.skybox) === null || _a === void 0 ? void 0 : _a.destroy();
        // @ts-ignore
        this._scene.skybox = null;
        (_b = this._scene.envAtlas) === null || _b === void 0 ? void 0 : _b.destroy();
        // @ts-ignore
        this._scene.envAtlas = null;
        this._scene = null;
    }
    /**
     * Sets the id of the `pc-asset` to use for the skybox.
     * @param value - The asset ID.
     */
    set asset(value) {
        this._asset = value;
        if (this.isConnected) {
            this._loadSkybox();
        }
    }
    /**
     * Gets the id of the `pc-asset` to use for the skybox.
     * @returns The asset ID.
     */
    get asset() {
        return this._asset;
    }
    /**
     * Sets the center of the skybox.
     * @param value - The center.
     */
    set center(value) {
        this._center = value;
        if (this._scene) {
            this._scene.sky.center = this._center;
        }
    }
    /**
     * Gets the center of the skybox.
     * @returns The center.
     */
    get center() {
        return this._center;
    }
    /**
     * Sets the intensity of the skybox.
     * @param value - The intensity.
     */
    set intensity(value) {
        this._intensity = value;
        if (this._scene) {
            this._scene.skyboxIntensity = this._intensity;
        }
    }
    /**
     * Gets the intensity of the skybox.
     * @returns The intensity.
     */
    get intensity() {
        return this._intensity;
    }
    /**
     * Sets the mip level of the skybox.
     * @param value - The mip level.
     */
    set level(value) {
        this._level = value;
        if (this._scene) {
            this._scene.skyboxMip = this._level;
        }
    }
    /**
     * Gets the mip level of the skybox.
     * @returns The mip level.
     */
    get level() {
        return this._level;
    }
    /**
     * Sets whether the skybox is used as a light source.
     * @param value - Whether to use lighting.
     */
    set lighting(value) {
        this._lighting = value;
    }
    /**
     * Gets whether the skybox is used as a light source.
     * @returns Whether to use lighting.
     */
    get lighting() {
        return this._lighting;
    }
    /**
     * Sets the Euler rotation of the skybox.
     * @param value - The rotation.
     */
    set rotation(value) {
        this._rotation = value;
        if (this._scene) {
            this._scene.skyboxRotation = new Quat().setFromEulerAngles(value);
        }
    }
    /**
     * Gets the Euler rotation of the skybox.
     * @returns The rotation.
     */
    get rotation() {
        return this._rotation;
    }
    /**
     * Sets the scale of the skybox.
     * @param value - The scale.
     */
    set scale(value) {
        this._scale = value;
        if (this._scene) {
            this._scene.sky.node.setLocalScale(this._scale);
        }
    }
    /**
     * Gets the scale of the skybox.
     * @returns The scale.
     */
    get scale() {
        return this._scale;
    }
    /**
     * Sets the type of the skybox.
     * @param value - The type.
     */
    set type(value) {
        this._type = value;
        if (this._scene) {
            this._scene.sky.type = this._type;
            const layer = this._scene.layers.getLayerById(LAYERID_SKYBOX);
            if (layer) {
                layer.enabled = this._type !== 'none';
            }
        }
    }
    /**
     * Gets the type of the skybox.
     * @returns The type.
     */
    get type() {
        return this._type;
    }
    static get observedAttributes() {
        return ['asset', 'center', 'intensity', 'level', 'lighting', 'rotation', 'scale', 'type'];
    }
    attributeChangedCallback(name, _oldValue, newValue) {
        switch (name) {
            case 'asset':
                this.asset = newValue;
                break;
            case 'center':
                this.center = parseVec3(newValue);
                break;
            case 'intensity':
                this.intensity = parseFloat(newValue);
                break;
            case 'level':
                this.level = parseInt(newValue, 10);
                break;
            case 'lighting':
                this.lighting = this.hasAttribute(name);
                break;
            case 'rotation':
                this.rotation = parseVec3(newValue);
                break;
            case 'scale':
                this.scale = parseVec3(newValue);
                break;
            case 'type':
                this.type = newValue;
                break;
        }
    }
}
customElements.define('pc-sky', SkyElement);

export { AppElement, AssetElement, AsyncElement, CameraComponentElement, CollisionComponentElement, ComponentElement, ElementComponentElement, EntityElement, LightComponentElement, ListenerComponentElement, MaterialElement, ModelElement, ModuleElement, ParticleSystemComponentElement, RenderComponentElement, RigidBodyComponentElement, SceneElement, ScreenComponentElement, ScriptComponentElement, ScriptElement, SkyElement, SoundComponentElement, SoundSlotElement, SplatComponentElement };
//# sourceMappingURL=pwc.mjs.map
