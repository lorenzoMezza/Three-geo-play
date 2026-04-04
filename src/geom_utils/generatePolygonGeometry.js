import * as THREE from 'three';
import { earcut }  from './earcut';


export function generatePolygonGeometry(polyFeature, layerProps, scale, tilePosX, tilePosY) {
    const needMultiLevel   = layerProps.multiLeveling?.allowMultiLevel || false;
    const extrusionHeight  = layerProps.height || false;
    const Y           = layerProps.Y || false;
    const needTransparency = layerProps.material?.transparent || false;

    const geoData    = polyFeature.polygon;
    const featureMap = polyFeature.featureMap;

    let shape;

    for (let i = 0; i < geoData.length; i++) {
        const polygon = normalizePolygonCoordinates(geoData[i], needTransparency, scale, tilePosX, tilePosY);
        const s = new THREE.Shape();
        s.moveTo(polygon[0].x, polygon[0].y);
        for (let j = 1; j < polygon.length; j++) s.lineTo(polygon[j].x, polygon[j].y);

        if (i === 0) shape = s;
        else         shape.holes.push(s);
    }

    let geometry;
    if (needMultiLevel) {
        const minH  = featureMap.get('render_min_height');
        const maxH  = featureMap.get('render_height');
        const depth = (maxH - minH) * scale * extrusionHeight;
        geometry = new THREE.ExtrudeGeometry(shape, { curveSegments: 1, depth, bevelEnabled: false });
        geometry.translate(0, 0, minH * extrusionHeight * scale);
    } else {
        geometry = new THREE.ExtrudeGeometry(shape, {
            curveSegments: 1,
            depth:         0.05 * extrusionHeight,
            bevelEnabled:  false,
        });
    }

    geometry.translate(0, 0, Y);
    geometry.rotateX(Math.PI / 2);
    geometry.rotateZ(Math.PI);

    return geometry;
}

function normalizePolygonCoordinates(polygon, _unused, scale, tileX, tileY) {
    return polygon.map(({ x, y }) => ({
        x: -(x * scale) - tileX,
        y:   y * scale  + tileY,
    }));
}



export function transformPointsInPolyRapp(pointsList) {
    return pointsList.map(points => {
        const polygon = [];
        for (let j = 0; j < points.length; j += 2)
            polygon.push({ x: points[j], y: points[j + 1] });
        return polygon;
    });
}

export function convertPolygonsToPointsList(polygons) {
    return polygons.map(polygon => {
        const points = new Float32Array(polygon.length * 2);
        for (let j = 0; j < polygon.length; j++) {
            points[j * 2]     = polygon[j].x;
            points[j * 2 + 1] = polygon[j].y;
        }
        return points;
    });
}


export function vertsToGeometry(verts) {
    const vertices = verts instanceof Float32Array ? verts : new Float32Array(verts);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1000);
    return geometry;
}



export function appendVertices(vertArray, polygon, y) {
    const indices = earcut(polygon, null, 2);
    for (const idx of indices)
        vertArray.push(polygon[idx * 2], y, polygon[idx * 2 + 1]);
    return indices.length;
}

export function appendVerticesWithHole(vertArray, outer, inner, y) {
    const combined = new Float32Array(outer.length + inner.length);
    combined.set(outer, 0);
    combined.set(inner, outer.length);
    const indices = earcut(combined, [outer.length / 2], 2);
    for (const idx of indices)
        vertArray.push(combined[idx * 2], y, combined[idx * 2 + 1]);
    return indices.length;
}

export function transformLineInPolygon(line, thickness, edgeSegments = 0) {
    const polygons      = [];
    const numSegments   = Math.floor(line.length / 2) - 1;
    const halfThickness = thickness * 0.5;

    for (let i = 0; i < numSegments; i++) {
        const x1 = line[i * 2],     y1 = line[i * 2 + 1];
        const x2 = line[i * 2 + 2], y2 = line[i * 2 + 3];

        const len = Math.hypot(x2 - x1, y2 - y1);
        if (len === 0) continue;

        const px = -(y2 - y1) / len * halfThickness;
        const py =  (x2 - x1) / len * halfThickness;

        const r0x = x1 + px, r0y = y1 + py;
        const r1x = x2 + px, r1y = y2 + py;
        const r2x = x2 - px, r2y = y2 - py;
        const r3x = x1 - px, r3y = y1 - py;

        if (edgeSegments > 0) {
            const startCap = makeHalfCircle(r0x, r0y, r3x, r3y, edgeSegments);
            const endCap   = makeHalfCircle(r2x, r2y, r1x, r1y, edgeSegments);

            if (numSegments === 1) {
                polygons.push(concatArrays(startCap, endCap));
            } else {
                if (i === 0)               polygons.push(concatArrays([r2x, r2y, r1x, r1y], startCap));
                if (i === numSegments - 1) polygons.push(concatArrays([r0x, r0y, r3x, r3y], endCap));
                if (i < numSegments - 1)   polygons.push(concatArrays([r0x, r0y, r3x, r3y], endCap));
            }
        } else {
            polygons.push(new Float32Array([r0x, r0y, r1x, r1y, r2x, r2y, r3x, r3y]));
        }
    }

    return polygons;
}

export function transformLineInPolygonDual(line, roadThickness, borderThickness, edgeSegments = 0) {
    return {
        roadPolys:   transformLineInPolygon(line, roadThickness,   edgeSegments),
        borderPolys: transformLineInPolygon(line, borderThickness, edgeSegments),
    };
}


export function transformLineToAccumulators(
    line, roadThickness, borderThickness, edgeSegments,
    roadAcc, borderAcc, y, outlineY = y - 0.01   // ← default automatico
) {
    const { roadPolys, borderPolys } = transformLineInPolygonDual(
        line, roadThickness, borderThickness, edgeSegments
    );
    for (const poly of roadPolys)   appendConvex(roadAcc,   poly, y);
    for (const poly of borderPolys) appendConvex(borderAcc, poly, outlineY);  // ← outlineY
}


function appendConvex(arr, polygon, y) {
    const n = polygon.length / 2;
    if (n < 3) return;
    const x0 = polygon[0], z0 = polygon[1];
    for (let i = 1; i < n - 1; i++) {
        arr.push(
            x0,                 y, z0,
            polygon[i * 2],     y, polygon[i * 2 + 1],
            polygon[i * 2 + 2], y, polygon[i * 2 + 3],
        );
    }
}

function makeHalfCircle(ax, ay, bx, by, segments) {
    const cx = (ax + bx) * 0.5, cy = (ay + by) * 0.5;
    const r  = Math.hypot(ax - bx, ay - by) * 0.5;
    const startAngle = Math.atan2(ay - cy, ax - cx);
    const step = Math.PI / (segments - 1);
    const out = [];
    for (let i = 0; i < segments; i++) {
        const a = startAngle + step * i;
        out.push(cx + r * Math.cos(a), cy + r * Math.sin(a));
    }
    return out;
}

function concatArrays(a, b) {
    const out = new Float32Array(a.length + b.length);
    out.set(a, 0);
    out.set(b, a.length);
    return out;
}