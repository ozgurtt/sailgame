/*global define */

define(
    ['Phaser', 'io', 'GameLogic', 'Ship', 'GuiVectors', 'GuiMinimap', 'GameEvent', 'Controls', 'TimedQueue'],
    function (Phaser, io, GameLogic, Ship, GuiVectors, GuiMinimap, GameEvent, Controls, TimedQueue) {
        var BasicGameGame = function (game) {

            //	When a State is added to Phaser it automatically has the following properties set on it, even if they already exist:

            //var self = this;

            // Phaser game variables
            /*
             self.game;		//	a reference to the currently running game
             self.add;		//	used to add sprites, text, groups, etc
             self.camera;	//	a reference to the game camera
             self.cache;		//	the game cache
             self.input;		//	the global input manager (you can access self.input.keyboard, self.input.mouse, as well from it)
             self.load;		//	for preloading assets
             self.math;		//	lots of useful common math operations
             self.sound;		//	the sound manager - add a sound, play one, set-up markers, etc
             self.stage;		//	the game stage
             self.time;		//	the clock
             self.tweens;	//	the tween manager
             self.world;		//	the game world
             self.particles;	//	the particle manager
             self.physics;	//	the physics manager
             self.rnd;		//	the repeatable random number generator
             */
            //	You can use any of these from any function within this State.
            //	But do consider them as being 'reserved words', i.e. don't create a property for your own game called "world" or you'll over-write the world reference.

            // Game logic variables
            /*
             self.cursors;
             self.io;
             self.socket;
             self.averagePingMs;
             self.controls;
             self.eventQueue;
             self.ships;
             self.playerShipId;
             self.bodySendTime;
             */
        };

        BasicGameGame.prototype = {

            create: function () {

                var self = this;

                self.eventQueue = [];

                self.timedQueue = new TimedQueue();

                self.ships = [];

                self.objects = [];

                self.io = io;
                self.socket = self.io.connect();
                self.averagePingMs = 10;
                self.serverTimeDiff = 0;
                self.lastInfoDiff = {};

                self.socket.on('connect', function () {
                    self.socket.emit('joinGame');
                });

                self.socket.on('clientPing', function (data) {
                    self.averagePingMs = 'undefined' !== typeof data.averagePingMs && null !== data.averagePingMs ? data.averagePingMs : self.averagePingMs;
                    self.socket.emit('clientPong', data.startTime);
                    self.serverTimeDiff = data.startTime + self.averagePingMs - self.game.time.time;
                });

                self.socket.on('joinOk', function (data) {
                    //console.log('Client got joinOk @ ' + GameLogic.timestampShortened(self.game.time.time));
                    var event = new GameEvent('joinOk', data);
                    self.timedQueue.push(data.ts, event);
                });

                self.socket.on('controlsReceive', function (data) {
                    var event = new GameEvent('controlsReceive', data);
                    self.timedQueue.push(data.ts, event);
                });

                self.socket.on('bodyReceive', function (data) {
                    var event = new GameEvent('bodyReceive', data);
                    self.timedQueue.push(data.ts, event);
                });

                self.socket.on('playerListChange', function (data) {
                    var event = new GameEvent('playerListChange', data);
                    self.timedQueue.push(data.ts, event);
                });

                self.socket.on('error', function (data) {
                    console.log(data || 'error');
                    alert('Socket error');
                    location.reload(true);
                });

                self.game.world.setBounds(-GameLogic.worldSize/2, -GameLogic.worldSize/2, GameLogic.worldSize, GameLogic.worldSize);

                self.game.physics.startSystem(Phaser.Physics.ARCADE);

                var waterBitmap = self.game.add.bitmapData(GameLogic.waterBitmapSize, GameLogic.waterBitmapSize);

                var waterGradient = waterBitmap.context.createLinearGradient(0, 0, GameLogic.waterBitmapSize - 1, GameLogic.waterBitmapSize - 1);
                waterGradient.addColorStop(0, GameLogic.waterColorLight);
                waterGradient.addColorStop(0.25, GameLogic.waterColorDark);
                waterGradient.addColorStop(0.5, GameLogic.waterColorLight);
                waterGradient.addColorStop(0.75, GameLogic.waterColorDark);
                waterGradient.addColorStop(1, GameLogic.waterColorLight);
                waterBitmap.context.fillStyle = waterGradient;
                waterBitmap.context.fillRect(0, 0, GameLogic.waterBitmapSize - 1, GameLogic.waterBitmapSize - 1);

                self.water = self.game.add.tileSprite(-GameLogic.worldSize/2, -GameLogic.worldSize/2, GameLogic.worldSize, GameLogic.worldSize, waterBitmap);

                self.guiVectors = new GuiVectors(
                    self.game, GameLogic.guiCircleRadius,
                    768 - GameLogic.guiCircleRadius,
                    GameLogic.guiCircleRadius
                );

                self.guiMinimap = new GuiMinimap(
                    self.game,
                    1024 - GameLogic.guiMinimapRectangleSize,
                    768 - GameLogic.guiMinimapRectangleSize,
                    GameLogic.guiMinimapRectangleSize
                );

                self.cursors = self.game.input.keyboard.createCursorKeys();
                self.activePointer = self.game.input.activePointer;
                self.controls = new Controls();

                //timer = self.game.time.create(false);
                //timer.start();
                self.game.time.advancedTiming = true;

            },

            update: function () {

                var self = this;

                GameLogic.forElementWithId(self.ships, self.playerShipId, function (playerShip) {
                    var previousControls = new Controls(self.controls);
                    self.controls.update(self.cursors, previousControls, self.eventQueue, self.activePointer, playerShip);
                });

                self.ships.forEach(function (ship) {
                    if (GameLogic.disableClientPhysics) {
                        ship.updateElements();
                    } else {
                        ship.update(); // Client physics
                    }
                });

                var event;

                while ('undefined' !== typeof (event = self.eventQueue.pop())) {
                    //console.log('eventQueue pop: ' + JSON.stringify(event));

                    switch (event.type) {
                        case 'controlsSend':
                            //console.log('Client controlsSend @ ' + GameLogic.timestampShortened(self.game.time.time));
                            event.data.id = self.playerShipId;
                            self.socket.emit('controlsSend', event.data);
                            break;

                        default:
                            break;
                    }
                }

                var events = self.timedQueue.get(self.game.time.time);

                events.forEach(function (event) {
                    switch (event.type) {
                        case 'bodyReceive':
                            //console.log('Client bodyReceive @ ' + GameLogic.timestampShortened(self.game.time.time));
                            GameLogic.forElementWithId(event.data.ships, self.playerShipId, GameLogic.returnInfoDiffCallback(event, self));

                            GameLogic.syncShipsWithServer(self.ships, event.data.ships, self.game, Ship);

                            break;

                        case 'controlsReceive':
                            //console.log('Client controlsReceive @ ' + GameLogic.timestampShortened(self.game.time.time));
                            GameLogic.forElementWithId(self.ships, event.data.id, GameLogic.returnControlsApplyCallback(event));
                            break;

                        case 'joinOk':
                            //console.log('Client joinOk @ ' + GameLogic.timestampShortened(self.game.time.time));
                            self.playerShipId = self.socket.socket.sessionid;
                            //console.log('joinOk: ' + self.playerShipId + ' players: ' + event.data.ships.length);

                            GameLogic.syncShipsWithServer(self.ships, event.data.ships, self.game, Ship);
                            //console.log('players: ' + self.ships.length);

                            GameLogic.forElementWithId(self.ships, self.playerShipId, GameLogic.returnSetCamera(self.game));

                            break;

                        case 'playerListChange':
                            //console.log('Client playerListChange @ ' + GameLogic.timestampShortened(self.game.time.time));
                            //console.log('playerListChange: ' + event.data + ' players: ' + event.data.ships.length);
                            GameLogic.syncShipsWithServer(self.ships, event.data.ships, self.game, Ship);
                            break;

                        default:
                            break;
                    }
                });
            },

            render: function () {
                var self = this;

                var debugObj = {};

                debugObj.fps = self.game.time.fps;
                debugObj.averagePingMs = self.averagePingMs;
                debugObj.players = self.ships.length + ' (' + self.ships.map(function (v) {return v.id;}).join(', ') + ')';

                GameLogic.forElementWithId(self.ships, self.playerShipId, function (playerShip) {
                    var shipVector = GameLogic.rotationToVector(playerShip.shipBody.rotation);
                    var windVector = GameLogic.getWindVector(playerShip.shipBody.body.position);
                    var sailVector = GameLogic.rotationToVector(playerShip.sail1.rotation);

                    debugObj.position = playerShip.shipBody.body.position;
                    debugObj.sailState = playerShip.sailState;
                    debugObj.windSailPressureProjected = GameLogic.windSailPressureProjected(shipVector, sailVector, windVector);
                    debugObj.currentTurnRate = GameLogic.currentTurnRate(playerShip.currentSpeed) / Math.PI * 180 * 1000;
                    debugObj.serverTime = self.game.time.time + self.serverTimeDiff;
                    debugObj.velocity = playerShip.shipBody.body.velocity;
                    debugObj.currentSpeed = Math.round(playerShip.currentSpeed / debugObj.windSailPressureProjected * 100 * 100)/100 + '%';
                    debugObj.currentSpeedDiff = Math.round((GameLogic.nextCurrentSpeed(
                        playerShip.currentSpeed,
                        playerShip.sailState * GameLogic.windSailPressureProjected(shipVector, sailVector, windVector),
                        self.game.time.elapsed
                    ) - playerShip.currentSpeed) / self.game.time.elapsed * 1000 * 100)/100;
                    debugObj.info = JSON.stringify(self.lastInfoDiff);

                    self.guiVectors.render(self.game.camera.x, self.game.camera.y, shipVector, windVector, sailVector);
                    self.guiMinimap.render(self.game.camera.x, self.game.camera.y, self.ships, self.playerShipId);

                    self.controls.render(self.game);
                });

                var count = 0;

                for (var debugKey in debugObj) {
                    if (debugObj.hasOwnProperty(debugKey)) {
                        self.game.debug.text(debugKey + ': ' + debugObj[debugKey], 32, ++count * 16);
                    }
                }
            },

            quitGame: function (/*pointer*/) {

                var self = this;

                //	Here you should destroy anything you no longer need.
                //	Stop music, delete sprites, purge caches, free resources, all that good stuff.

                //	Then let's go back to the main menu.
                self.state.start('MainMenu');

            }

        };

        return BasicGameGame;
    }
);

