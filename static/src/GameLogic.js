/*global Phaser */

var GameLogic = {
    windSpeed: 64,
    sailStep: 5,
    sailShift: -5,
    sailMaxTurnAngle: 60,
    epsilonDegrees: 0.001,
    waterColorLight: '#1F96C1',
    waterColorDark: '#25A1C6',
    waterBitmapSize: 196,
    worldSize: 10000
};

GameLogic.windRotation = function (positionPoint) {
    var windVector = GameLogic.rotate(new Phaser.Point(-positionPoint.x, -positionPoint.y), Math.PI / 2);

    return GameLogic.vectorToRotation(windVector);
};

GameLogic.getWindVector = function (positionPoint) {
    return GameLogic.rotationToVector(GameLogic.windRotation(positionPoint))
        .multiply(GameLogic.windSpeed, GameLogic.windSpeed);
};

GameLogic.rotationToVector = function (rotation) {
    return new Phaser.Point(Math.cos(rotation), Math.sin(rotation));
};

GameLogic.vectorToRotation = function (vector, asDegrees) {
    return new Phaser.Point(0, 0).angle(vector, asDegrees);
};

GameLogic.normalizeRotation = function (rotation) {
    var result = rotation;

    while (Math.abs(result) > 180 + GameLogic.epsilonDegrees) {
        result -= result / Math.abs(result) * 360;
    }

    return result;
};

GameLogic.angle = function (a, b, asDegrees) {
    if (typeof asDegrees === 'undefined') {
        asDegrees = false;
    }

    var result = 0;

    if (!a.isZero() && !b.isZero()) {
        result = GameLogic.vectorToRotation(b, 'asDegrees') - GameLogic.vectorToRotation(a, 'asDegrees');

        result = GameLogic.normalizeRotation(result);
    }

    if (asDegrees) {
        return result;
    } else {
        return Phaser.Math.degToRad(result);
    }
};

GameLogic.rotate = function (point, angle) {
    return new Phaser.Point(
        point.x * Math.cos(angle) - point.y * Math.sin(angle),
        point.x * Math.sin(angle) + point.y * Math.cos(angle)
    );
};

GameLogic.windSailCase = function (shipVector, windVector) {
    var shipWindAngle = GameLogic.angle(shipVector, windVector, 'asDegrees');

    var result = 'rear';

    if (Math.abs(shipWindAngle) > (180 - GameLogic.sailMaxTurnAngle) + GameLogic.epsilonDegrees) {
        result = 'front';
    } else if (Math.abs(shipWindAngle) > GameLogic.sailMaxTurnAngle + GameLogic.epsilonDegrees) {
        result = 'side';
    }

    return result;
};

GameLogic.sailRotation = function (shipVector, windVector, asDegrees) {
    var shipWindAngle = GameLogic.angle(shipVector, windVector, 'asDegrees');

    var result = GameLogic.vectorToRotation(windVector, 'asDegrees');

    var windCase = GameLogic.windSailCase(shipVector, windVector);

    switch (windCase) {
        case 'front':
            result = GameLogic.vectorToRotation(shipVector, 'asDegrees') -
                (180 - GameLogic.sailMaxTurnAngle) * shipWindAngle / Math.abs(shipWindAngle);
            break;
        case 'side':
            result = result - 90 * shipWindAngle / Math.abs(shipWindAngle);
            break;
    }

    result = GameLogic.normalizeRotation(result);

    var sailWindAngle = GameLogic.normalizeRotation(result - GameLogic.vectorToRotation(windVector, 'asDegrees'));

    if (Math.abs(sailWindAngle) > 90 + GameLogic.epsilonDegrees) {
        result = result + 180;
    }

    result = GameLogic.normalizeRotation(result);

    if (asDegrees) {
        return result;
    } else {
        return Phaser.Math.degToRad(result);
    }
};

GameLogic.windSailPressureNormalized = function (sailVector, windVector) {
    var sailWindAngle = GameLogic.angle(sailVector, windVector);

    var cos = Math.cos(sailWindAngle);

    return (Math.pow(cos * cos, 3) + 0.4 * Math.pow(1 - cos * cos, 2)) * windVector.getMagnitude();
};

GameLogic.windSailPressureProjected = function (shipVector, sailVector, windVector) {
    var shipSailAngle = GameLogic.angle(shipVector, sailVector);

    return Math.cos(shipSailAngle) * GameLogic.windSailPressureNormalized(sailVector, windVector);
};

GameLogic.forElementWithId = function (array, id, callback) {
    for (var i = 0, len = array.length; i < len; ++i) {
        var element = array[i];

        if (element.id === id) {
            callback(element, i);

            break;
        }
    }
};

GameLogic.syncShipsWithServer = function (selfShips, serverShips, game, ShipClass) {
    var shipsToDelete = selfShips.slice();

    var removeElement = function (shipToDelete, index) {
        console.log('keeping ship ' + shipToDelete.id);
        shipsToDelete.splice(index, 1);
    };

    var found = false;

    var shipFoundCallback = function (foundShip) {
        found = true;

        // If found, remove from shipsToDelete
        GameLogic.forElementWithId(shipsToDelete, foundShip.id, removeElement);
    };

    for (var i = 0, len = serverShips.length; i < len; ++i) {
        found = false;

        // Find ship with this id in selfShips
        GameLogic.forElementWithId(selfShips, serverShips[i].id, shipFoundCallback);

        // If not found, add ship
        if (!found) {
            // TODO apply body params
            var ship = new ShipClass(serverShips[i].id, game, -GameLogic.worldSize/4, GameLogic.worldSize/4);

            selfShips.push(ship);
            console.log('adding ship ' + ship.id);

            GameLogic.forElementWithId(shipsToDelete, ship.id, removeElement);
        }
    }

    // Delete all shipsToDelete left
    shipsToDelete.forEach(function (shipToDelete) {
        GameLogic.forElementWithId(selfShips, shipToDelete.id, function (ship, index) {
            console.log('removing ship ' + ship.id);
            selfShips.splice(index, 1);
        });
    });
};

GameLogic.returnControlsReceiveCallback = function (event) {
    return function (ship) {
        ship.controls.steering = event.data.steering;
        ship.controls.sailState = event.data.sailState;
    };
};

GameLogic.returnBodyReceiveCallback = function (event, basicGameGame) {
    return function (ship) {
        // TODO Apply to playerShip too when server physics are available
        if (ship.id !== basicGameGame.playerShipId) {
            ship.shipBody.x = event.data.x;
            ship.shipBody.x = event.data.x;
            ship.shipBody.rotation = event.data.rotation;
            ship.currentSpeed = event.data.currentSpeed;
        }
    };
};

