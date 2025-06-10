import * as pc from 'playcanvas';

import { CubicSpline } from 'spline';

const nearlyEquals = (a, b, epsilon = 1e-4) => {
    return !a.some((v, i) => Math.abs(v - b[i]) >= epsilon);
};

const url = new URL(location.href);

const params = {
    noui: url.searchParams.has('noui'),
    noanim: url.searchParams.has('noanim'),
    posterUrl: url.searchParams.get('poster')
};

// display a blurry poster image which resolves to sharp during loading
class Poster {
    constructor(url) {
        const blur = (progress) => `blur(${Math.floor((100 - progress) * 0.4)}px)`;

        const element = document.getElementById('poster');
        element.style.backgroundImage = `url(${url})`;
        element.style.display = 'block';
        element.style.filter = blur(0);

        this.progress = (progress) => {
            element.style.filter = blur(progress);
        };

        this.hide = () => {
            element.style.display = 'none';
        };
    }
}

const poster = params.posterUrl && new Poster(params.posterUrl);

class FrameScene extends pc.Script {
    initialize() {
        const { settings } = this;
        const { camera, animTracks } = settings;
        const { position, target } = camera;

        this.position = position && new pc.Vec3(position);
        this.target = target && new pc.Vec3(target);

        // construct camera animation track
        if (animTracks?.length > 0 && settings.camera.startAnim === 'animTrack') {
            const track = animTracks.find(track => track.name === camera.animTrack);
            if (track) {
                const { keyframes, duration } = track;
                const { times, values } = keyframes;
                const { position, target } = values;

                // construct the points array containing position and target
                const points = [];
                for (let i = 0; i < times.length; i++) {
                    points.push(position[i * 3], position[i * 3 + 1], position[i * 3 + 2]);
                    points.push(target[i * 3], target[i * 3 + 1], target[i * 3 + 2]);
                }

                this.cameraAnim = {
                    time: 0,
                    spline: CubicSpline.fromPointsLooping(duration, times, points),
                    track,
                    result: []
                };
            }
        }

        // 휠 관련 속성 추가
        this.zoomSpeed = 0.15;
        this.minDistance = 0.5;
        this.maxDistance = 50;
        this.targetDistance = null;
        this.currentDistance = null;
        this.isWheelActive = false;

        // 휠 이벤트 바인딩 및 등록
        this.handleWheel = this.handleWheel.bind(this);
        window.addEventListener('wheel', this.handleWheel, { passive: false });
    }

    // 휠 이벤트 핸들러 추가
    handleWheel(event) {
        if (this.targetDistance === null) {
            // 초기 거리 계산
            const gsplatComponent = this.app.root.findComponent('gsplat');
            if (gsplatComponent?.instance?.meshInstance?.aabb) {
                const bbox = gsplatComponent.instance.meshInstance.aabb;
                const sceneSize = bbox.halfExtents.length();
                this.currentDistance = sceneSize * 2;
                this.targetDistance = this.currentDistance;
                this.targetPosition = bbox.center.clone();
            } else {
                this.currentDistance = 5;
                this.targetDistance = this.currentDistance;
                this.targetPosition = new pc.Vec3(0, 0, 0);
            }
        }

        event.preventDefault();
        this.isWheelActive = true;

        const delta = -Math.sign(event.deltaY) * this.zoomSpeed;

        this.targetDistance = Math.max(
            this.minDistance,
            Math.min(this.maxDistance, this.targetDistance * (1 - delta))
        );

        // 기존 애니메이션 취소
        this.cancelAnimation && this.cancelAnimation();

        // 렌더링 업데이트 요청
        this.app.renderNextFrame = true;
    }

    frameScene(bbox, smooth = true) {
        const sceneSize = bbox.halfExtents.length();
        const distance = sceneSize / Math.sin(this.entity.camera.fov / 180 * Math.PI * 0.5);
        this.entity.script.cameraControls.sceneSize = sceneSize;
        this.entity.script.cameraControls.focus(bbox.center, new pc.Vec3(2, 1, 2).normalize().mulScalar(distance).add(bbox.center), smooth);
    }

    resetCamera(bbox, smooth = true) {
        const sceneSize = bbox.halfExtents.length();
        this.entity.script.cameraControls.sceneSize = sceneSize * 0.2;
        this.entity.script.cameraControls.focus(this.target ?? Vec3.ZERO, this.position ?? new pc.Vec3(2, 1, 2), smooth);
    }

    initCamera() {
        const { app } = this;
        const { graphicsDevice } = app;
        let animating = false;
        let animationTimer = 0;

        // get the gsplat component
        const gsplatComponent = app.root.findComponent('gsplat');

        // calculate the bounding box
        const bbox = gsplatComponent?.instance?.meshInstance?.aabb ?? new pc.BoundingBox();
        if (bbox.halfExtents.length() > 100 || this.position || this.target) {
            this.resetCamera(bbox, false);
        } else {
            this.frameScene(bbox, false);
        }

        const cancelAnimation = () => {
            if (animating) {
                animating = false;

                // copy current camera position and target
                const r = this.cameraAnim.result;
                this.entity.script.cameraControls.focus(
                    new pc.Vec3(r[3], r[4], r[5]),
                    new pc.Vec3(r[0], r[1], r[2]),
                    false
                );
            }
        };

        // listen for interaction events
        const events = ['wheel', 'pointerdown', 'contextmenu'];
        //const events = ['pointerdown', 'contextmenu'];
        const handler = (e) => {
            cancelAnimation();
            events.forEach(event => app.graphicsDevice.canvas.removeEventListener(event, handler));
        };
        events.forEach(event => app.graphicsDevice.canvas.addEventListener(event, handler));

        window.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.altKey || e.metaKey) return;

            switch (e.key) {
                case 'f':
                    cancelAnimation();
                    this.frameScene(bbox);
                    break;
                case 'r':
                    cancelAnimation();
                    this.resetCamera(bbox);
                    break;
            }
        });

        app.on('update', (deltaTime) => {
            // handle camera animation
            if (this.cameraAnim && animating && !params.noanim) {
                const { cameraAnim } = this;
                const { spline, track, result } = cameraAnim;

                // update animation timer
                animationTimer += deltaTime;

                // update the track cursor
                if (animationTimer < 5) {
                    // ease in
                    cameraAnim.time += deltaTime * Math.pow(animationTimer / 5, 0.5);
                } else {
                    cameraAnim.time += deltaTime;
                }

                if (cameraAnim.time >= track.duration) {
                    switch (track.loopMode) {
                        case 'none': cameraAnim.time = track.duration; break;
                        case 'repeat': cameraAnim.time = cameraAnim.time % track.duration; break;
                        case 'pingpong': cameraAnim.time = cameraAnim.time % (track.duration * 2); break;
                    }
                }

                // evaluate the spline
                spline.evaluate(cameraAnim.time > track.duration ? track.duration - cameraAnim.time : cameraAnim.time, result);

                // set camera
                this.entity.setPosition(result[0], result[1], result[2]);
                this.entity.lookAt(result[3], result[4], result[5]);
            }
        });

        const prevProj = new pc.Mat4();
        const prevWorld = new pc.Mat4();

        app.on('framerender', () => {
            if (!app.autoRender && !app.renderNextFrame) {
                const world = this.entity.getWorldTransform();
                if (!nearlyEquals(world.data, prevWorld.data)) {
                    app.renderNextFrame = true;
                }

                const proj = this.entity.camera.projectionMatrix;
                if (!nearlyEquals(proj.data, prevProj.data)) {
                    app.renderNextFrame = true;
                }

                if (app.renderNextFrame) {
                    prevWorld.copy(world);
                    prevProj.copy(proj);
                }
            }
        });

        // wait for first gsplat sort
        const handle = gsplatComponent?.instance?.sorter?.on('updated', () => {
            handle.off();

            // request frame render
            app.renderNextFrame = true;

            // wait for first render to complete
            const frameHandle = app.on('frameend', () => {
                frameHandle.off();

                // hide loading indicator
                document.getElementById('loadingWrap').classList.add('hidden');

                // fade out poster
                poster?.hide();

                // start animating once the first frame is rendered
                if (this.cameraAnim) {
                    animating = true;
                }

                // emit first frame event on window
                window.firstFrame?.();
            });
        });

        const updateHorizontalFov = (width, height) => {
            this.entity.camera.horizontalFov = width > height;
        };

        // handle fov on canvas resize
        graphicsDevice.on('resizecanvas', (width, height) => {
            updateHorizontalFov(width, height);
            app.renderNextFrame = true;
        });

        // configure on-demand rendering
        app.autoRender = false;
        updateHorizontalFov(graphicsDevice.width, graphicsDevice.height);
    }

    postInitialize() {
        const assets = this.app.assets.filter(asset => asset.type === 'gsplat');
        if (assets.length > 0) {
            const asset = assets[0];
            if (asset.loaded) {
                this.initCamera();
            } else {
                asset.on('load', () => {
                    this.initCamera();
                });
            }
        }
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    const appElement = await document.querySelector('pc-app').ready();
    const cameraElement = await document.querySelector('pc-entity[name="camera"]').ready();
    const app = await appElement.app;

    // loading 3dgs model
    const gsplatUrl = "./mongol.compressed.ply";
    // GSplat 파일을 로드하기 위한 자산(Asset)을 생성합니다.
    var gsplatAsset = new pc.Asset("gsplat", "gsplat", { url: gsplatUrl });

    // 자산 로드 이벤트를 처리합니다.
    gsplatAsset.on('load', function (asset) {
        // GSplat 자산이 로드되면, GSplat 컴포넌트를 생성하고 엔티티에 추가합니다.
        var entity = new pc.Entity();
        app.root.addChild(entity);

        // GSplat 컴포넌트를 엔티티에 추가합니다.
        entity.addComponent('gsplat', {
            asset: asset
        });

        //console.log("GSplat 파일 로드 완료!");
        document.getElementById('loadingWrap').classList.add('hidden');

        const message = "징키스칸 동상";
        addExplainCube(app, message, 4, 0, 20, 0.5);

    });

    // 자산 로드 오류 이벤트를 처리합니다.
    gsplatAsset.on('error', function (err, asset) {
        console.error("GSplat 파일 로드 실패:", err);
    });

    // 자산을 로드합니다.
    app.assets.add(gsplatAsset);
    app.assets.load(gsplatAsset);

    /*
    */
    const camera = cameraElement.entity;
    const settings = await window.settings;

    camera.camera.clearColor = new pc.Color(settings.background.color);
    camera.camera.fov = settings.camera.fov;
    camera.script.create(FrameScene, {
        properties: { settings }
    });

    // Update loading indicator
    const assets = app.assets.filter(asset => asset.type === 'gsplat');
    if (assets.length > 0) {
        const asset = assets[0];
        const loadingText = document.getElementById('loadingText');
        const loadingBar = document.getElementById('loadingBar');
        asset.on('progress', (received, length) => {
            const v = (Math.min(1, received / length) * 100).toFixed(0);
            loadingText.textContent = `${v}%`;
            loadingBar.style.backgroundImage = 'linear-gradient(90deg, #F60 0%, #F60 ' + v + '%, white ' + v + '%, white 100%)';
            poster?.progress(v);
        });
        asset.on('load', (ast) => {
            window.setTimeout(() => {
                // 
                // 강제로 화면 업데이트
                app.renderNextFrame = true;
                // 또는 다음 프레임을 기다리지 않고 즉시 렌더링
                app.render();

            }, 200);
        });
    }


    // On entering/exiting AR, we need to set the camera clear color to transparent black
    let cameraEntity, skyType = null;
    const clearColor = new pc.Color();

    app.xr.on('start', () => {
        if (app.xr.type === 'immersive-ar') {
            cameraEntity = app.xr.camera;
            clearColor.copy(cameraEntity.camera.clearColor);
            cameraEntity.camera.clearColor = new pc.Color(0, 0, 0, 0);

            const sky = document.querySelector('pc-sky');
            if (sky && sky.type !== 'none') {
                skyType = sky.type;
                sky.type = 'none';
            }

            app.autoRender = true;
        }
    });

    app.xr.on('end', () => {
        if (app.xr.type === 'immersive-ar') {
            cameraEntity.camera.clearColor = clearColor;

            const sky = document.querySelector('pc-sky');
            if (sky) {
                if (skyType) {
                    sky.type = skyType;
                    skyType = null;
                } else {
                    sky.removeAttribute('type');
                }
            }

            app.autoRender = false;
        }
    });

    // Get button and info panel elements
    const dom = ['arMode', 'vrMode', 'enterFullscreen', 'exitFullscreen', 'info', 'infoPanel', 'buttonContainer'].reduce((acc, id) => {
        acc[id] = document.getElementById(id);
        return acc;
    }, {});

    // AR
    if (app.xr.isAvailable('immersive-ar')) {
        dom.arMode.classList.remove('hidden');
        dom.arMode.addEventListener('click', () => app.xr.start(app.root.findComponent('camera'), 'immersive-ar', 'local-floor'));
    }

    // VR
    if (app.xr.isAvailable('immersive-vr')) {
        dom.vrMode.classList.remove('hidden');
        dom.vrMode.addEventListener('click', () => app.xr.start(app.root.findComponent('camera'), 'immersive-vr', 'local-floor'));
    }

    // Fullscreen
    if (document.documentElement.requestFullscreen && document.exitFullscreen) {
        dom.enterFullscreen.classList.remove('hidden');
        dom.enterFullscreen.addEventListener('click', () => document.documentElement.requestFullscreen());
        dom.exitFullscreen.addEventListener('click', () => document.exitFullscreen());
        document.addEventListener('fullscreenchange', () => {
            dom.enterFullscreen.classList[document.fullscreenElement ? 'add' : 'remove']('hidden');
            dom.exitFullscreen.classList[document.fullscreenElement ? 'remove' : 'add']('hidden');
        });
    }

    // Info
    dom.info.addEventListener('click', () => {
        dom.infoPanel.classList.toggle('hidden');
    });

    // Keyboard handler
    window.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            if (app.xr.active) {
                app.xr.end();
            }
            dom.infoPanel.classList.add('hidden');
        }
    });

    // Hide UI
    if (params.noui) {
        dom.buttonContainer.classList.add('hidden');
    }
});

function createTextTexture(app, text, width = 512, height = 512) {
    // Create a canvas to draw the text
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');

    // Fill background
    ctx.fillStyle = '#E33C2F';
    ctx.fillRect(0, 0, width, height);

    // Setup text
    ctx.font = 'bold 75px "Noto Sans KR"';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';

    // Draw text in center
    ctx.fillText("# POI 정보", width / 2, 100);
    ctx.fillText(text, width / 2, height / 2 + 40);

    // Draw a border
    //ctx.strokeStyle = '#ff0000';
    //ctx.lineWidth = 8;
    //ctx.strokeRect(16, 16, width - 32, height - 32);

    // Create a PlayCanvas texture from the canvas
    const texture = new pc.Texture(app.graphicsDevice);
    texture.setSource(canvas);

    return texture;
}

function addExplainCube(app, message, cubeSize, x, y, z) {
    // Create a cube entity
    const cube = new pc.Entity('cube');
    cube.addComponent('model', {
        type: 'box'
    });

    // Create material with text texture
    const material = new pc.StandardMaterial();
    material.diffuseMap = createTextTexture(app, message);
    material.update();

    // Assign material to cube model
    cube.model.material = material;

    cube.setPosition(x, y, z);
    // 큐브의 크기 설정
    var size = new pc.Vec3(cubeSize, cubeSize, cubeSize); // 큐브의 크기를 2x2x2로 설정
    cube.setLocalScale(size); // 엔티티의 로컬 스케일을 설정

    const overlayLayer = app.scene.layers.getLayerByName('Immediate');

    if (overlayLayer) {
        // Plane 엔티티에 render 컴포넌트가 있다면 해당 컴포넌트의 레이어를 설정합니다.
        // 이 방법은 해당 엔티티의 모든 렌더링 가능한 요소 (MeshInstance)를 해당 레이어로 이동시킵니다.
        cube.render.layers = [overlayLayer.id];
        console.log(`Cube added to OverlayLayer with ID: ${overlayLayer.id}`);
    } else {
        console.warn("OverlayLayer not found. Please create 'OverlayLayer' in PlayCanvas Editor under Project Settings -> Rendering.");
    }

    // Add cube to scene
    app.root.addChild(cube);

    // Create rotation script
    // const RotateScript = pc.createScript('rotateScript');

    // RotateScript.prototype.update = function (dt) {
    //     this.entity.rotate(10 * dt, 15 * dt, 5 * dt);
    // };

    // // Register and apply rotation script to the cube
    // app.scripts.add(RotateScript);
    // cube.addComponent('script');
    // cube.script.create('rotateScript');

    return cube;
}