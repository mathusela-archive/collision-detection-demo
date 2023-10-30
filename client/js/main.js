const sVertexShaderSource = 
`attribute vec2 vPos;
uniform mat3 transform;

void main() {
	vec3 transformed = (transform * vec3(vPos, 1.0));
	gl_Position = vec4(transformed.x/transformed.z, transformed.y/transformed.z, 0.0, 1.0);
}`

const sFragmentShaderSource =
`precision highp float;
uniform vec4 color;

void main() {
	gl_FragColor = vec4(color);
}`

const pVertexShaderSource = 
`precision highp float;

attribute vec2 vPos;
uniform float size;

void main() {
	gl_PointSize = size;
	gl_Position = vec4(vPos, 0.0, 1.0);
}`

const pFragmentShaderSource =
`precision highp float;
uniform vec4 color;

void main() {
	gl_FragColor = vec4(color);
}`

/**
 * @param {MouseEvent} e
 * @param {HTMLCanvasElement} canvas
 * @return {Point}
 */
function getMousePos(e, canvas) {
	const rect = canvas.getBoundingClientRect();
	let x = e.clientX - rect.left;
	x = (x/rect.width)*2-1
	let y = e.clientY-rect.top;
	y = (y/rect.height)*2-1
	y *= -1;
	return new Point(x, y);
}

class Point {
	/**
	 * @param {Number} x 
	 * @param {Number} y 
	 */
	constructor(x, y) {
		this.x = x;
		this.y = y;
	}
};

class Matrix {
	/**
	 * @param {Array<Array<Number>>} data 
	 */
	constructor(data) {
		this.data = data;
	}

	get transpose() {
		let d = this.data;
		return new Matrix([
			[d[0][0], d[1][0], d[2][0]],
			[d[0][1], d[1][1], d[2][1]],
			[d[0][2], d[1][2], d[2][2]]
		]);
	}

	get webGL() {
		let out = [];
		this.transpose.data.forEach((x) => {
			x.forEach((y) => {
				out.push(y);
			});
		});
		return out;
	}
};

/**
 * @param {Matrix} m 
 * @param {Point} p 
 * @returns {Point}
 */
function M3xP2(mx, p) {
	let m = mx.data;
	const hIn = [p.x, p.y, 1]
	let hOut = 
		[	m[0][0]*hIn[0] + m[0][1]*hIn[1] + m[0][2]*hIn[2],
			m[1][0]*hIn[0] + m[1][1]*hIn[1] + m[1][2]*hIn[2],
			m[2][0]*hIn[0] + m[2][1]*hIn[1] + m[2][2]*hIn[2]
		]
	return new Point(hOut[0]/hOut[2], hOut[1]/hOut[2]);
}

/**
 * @param {Matrix} m 
 * @param {Array<Point>} ps 
 * @returns {Array<Point>}
 */
function M3xListP2(m, ps) {
	let out = [];
	ps.forEach((p) => {
		out.push(M3xP2(m, p));
	});
	return out;
}

class Shape {
	genShaders() {
		const gl = this.gl;

		const vertexShader = gl.createShader(gl.VERTEX_SHADER);
		gl.shaderSource(vertexShader, sVertexShaderSource);
		gl.compileShader(vertexShader);
		
		const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
		gl.shaderSource(fragmentShader, sFragmentShaderSource);
		gl.compileShader(fragmentShader);
		
		this.shaderProgram = gl.createProgram();
		const shaderProgram = this.shaderProgram;
		gl.attachShader(shaderProgram, vertexShader);
		gl.attachShader(shaderProgram, fragmentShader);
		gl.linkProgram(shaderProgram);
	}
	
	/**
	 * @param {Array<Point>} xs 
	 */
	pointsArrayToFloatArray(xs) {
		const arr = new Array;
		xs.forEach((point) => {
			arr.push(point.x); arr.push(point.y);
		});
		arr.push(xs[0].x); arr.push(xs[0].y);
		return arr;
	}

	updateVBO(verts) {
		this.verts = verts;
		let gl = this.gl;
		let VBO = this.VBO;

		gl.bindBuffer(gl.ARRAY_BUFFER, VBO);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.pointsArrayToFloatArray(this.verts)), this.drawType);
		
		gl.bindVertexArray(null);
	}
	
	genBuffers() {
		const gl = this.gl;

		this.VAO = gl.createVertexArray();
		this.VBO = gl.createBuffer();
		const VAO = this.VAO;
		const VBO = this.VBO;
		
		gl.bindVertexArray(VAO);
		
		gl.bindBuffer(gl.ARRAY_BUFFER, VBO);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.pointsArrayToFloatArray(this.verts)), this.drawType);
		
		const pos = gl.getAttribLocation(this.shaderProgram, "vPos")
		gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
		gl.enableVertexAttribArray(pos);
		
		gl.bindVertexArray(null);
		gl.bindBuffer(gl.ARRAY_BUFFER, null);
	}

	get transformMatrix() {
		const rotation = this.rotation/180 * Math.PI;
		return new Matrix([
			[Math.cos(rotation)*this.scale, -Math.sin(rotation)*this.scale, this.offset[0]],
			[Math.sin(rotation)*this.scale, Math.cos(rotation)*this.scale, this.offset[1]],
			[0, 0, 1]
		]);
	}

	draw() {
		const gl = this.gl;

		gl.useProgram(this.shaderProgram);
		gl.uniform4fv(gl.getUniformLocation(this.shaderProgram, "color"), this.color);
		gl.uniformMatrix3fv(gl.getUniformLocation(this.shaderProgram, "transform"), false, this.transformMatrix.webGL);

		gl.bindVertexArray(this.VAO);
		gl.drawArrays(gl.LINE_STRIP, 0, this.verts.length + 1);

		this.collisionCount = 0;
	}

	/**
	 * @param {Point} mousePos
	 * @param {Boolean} mouseDown 
	 * @param {Boolean} mouseClicked
	 * @param {Object} keysPressed
	 */
	handleInput(mousePos, mouseDown, mouseClicked, keysPressed) {
		const hovered = isPointWithinShape(mousePos, this);

		if (hovered && mouseClicked) {
			this.previousMousePos = mousePos;
			this.selected = true;
		};
		if (!mouseDown) this.selected = false;
		if (this.selected) {
			this.color = [1.0, 0.0, 0.0, 1.0];
			this.offset = [this.offset[0]+(mousePos.x-this.previousMousePos.x), this.offset[1]+(mousePos.y-this.previousMousePos.y)];
			this.previousMousePos = mousePos;

			const rotationSpeed = 1.5;
			const scaleSpeed = 0.01;
			if (keysPressed.leftArrow || keysPressed.a) this.rotation += rotationSpeed;
			if (keysPressed.rightArrow || keysPressed.d) this.rotation -= rotationSpeed;
			if (keysPressed.upArrow || keysPressed.w) this.scale += scaleSpeed;
			if (keysPressed.downArrow || keysPressed.s && this.scale > 0.01) this.scale -= scaleSpeed;
		}
		else this.color = this.defaultColor;
	}

	handleCollision(hasCollided) {
		if (hasCollided) this.collisionCount++;
		if (this.collisionCount != 0) this.color = [0.0, 1.0, 0.0, 1.0];
	} 
	
	/** 
	 * @param {Array<Point>} verts
	 * @param {WebGL2RenderingContext} gl 
	 */
	constructor(verts, gl, defaultColor = [0.0, 0.0, 0.0, 1.0], drawType = gl.STATIC_DRAW) {
		this.gl = gl;
		this.verts = verts;
		this.defaultColor = defaultColor;
		this.color = defaultColor;
		this.selected = false;
		this.offset = [0.0, 0.0];
		this.rotation = 0.0;
		this.previousMousePos = new Point(0.0, 0.0);
		this.scale = 1.0;
		this.drawType = drawType;
		this.collisionCount = 0;
		this.genShaders();
		this.genBuffers();
	}
};

function isPointWithinShape(p, s) {
	const transformed = M3xListP2(s.transformMatrix, s.verts);
		const verts = transformed.concat(transformed[0]);
		let collisionCount = 0;
		
		const xs = p.x; let ys = p.y;

		for (let n=0; n < verts.length-1; n++) {
			const x1 = verts[n].x; let y1 = verts[n].y;
			const x2 = verts[n+1].x; let y2 = verts[n+1].y;

			if (y1 - y2 == 0) continue;

			const xCol = ((ys - y1)*(x1 - x2))/(y1 - y2) + x1

			// FIXME: If this        v        is <= you get a bug, this fix probably introduces new bugs because idk why it fixes it
			if (((x2 <= xCol && xCol < x1) || (x2 >= xCol && xCol >= x1)) && ((y2 <= ys && ys <= y1) || (y2 >= ys && ys >= y1)) && xs <= xCol) collisionCount++;
		}

		return collisionCount % 2 != 0;
}

// IDK how inheritance works in JS
// TODO: Use inheritance for this :)
class PointCloud {
	genShaders() {
		const gl = this.gl;

		const vertexShader = gl.createShader(gl.VERTEX_SHADER);
		gl.shaderSource(vertexShader, pVertexShaderSource);
		gl.compileShader(vertexShader);
		
		const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
		gl.shaderSource(fragmentShader, pFragmentShaderSource);
		gl.compileShader(fragmentShader);
		
		this.shaderProgram = gl.createProgram();
		const shaderProgram = this.shaderProgram;
		gl.attachShader(shaderProgram, vertexShader);
		gl.attachShader(shaderProgram, fragmentShader);
		gl.linkProgram(shaderProgram);
	}
	
	/**
	 * @param {Array<Point>} xs 
	 */
	pointsArrayToFloatArray(xs) {
		const arr = new Array;
		xs.forEach((point) => {
			arr.push(point.x); arr.push(point.y);
		});
		return arr;
	}

	updateVBO(verts) {
		this.verts = verts;
		let gl = this.gl;
		let VBO = this.VBO;

		gl.bindBuffer(gl.ARRAY_BUFFER, VBO);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.pointsArrayToFloatArray(this.verts)), gl.DYNAMIC_DRAW);
		
		gl.bindVertexArray(null);
	}
	
	genBuffers() {
		const gl = this.gl;

		this.VAO = gl.createVertexArray();
		this.VBO = gl.createBuffer();
		const VAO = this.VAO;
		const VBO = this.VBO;
		
		gl.bindVertexArray(VAO);
		
		gl.bindBuffer(gl.ARRAY_BUFFER, VBO);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.pointsArrayToFloatArray(this.verts)), gl.DYNAMIC_DRAW);
		
		const pos = gl.getAttribLocation(this.shaderProgram, "vPos")
		gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
		gl.enableVertexAttribArray(pos);
		
		gl.bindVertexArray(null);
		gl.bindBuffer(gl.ARRAY_BUFFER, null);
	}

	draw() {
		const gl = this.gl;

		gl.useProgram(this.shaderProgram);
		gl.uniform4fv(gl.getUniformLocation(this.shaderProgram, "color"), this.color);
		gl.uniform1f(gl.getUniformLocation(this.shaderProgram, "size"), this.size);

		gl.bindVertexArray(this.VAO);
		gl.drawArrays(gl.POINTS, 0, this.verts.length);
	}

	/**
	* @param {Array<Point>} verts
	* @param {Array<Number>} color
	* @param {Number} size
	* @param {WebGL2RenderingContext} gl 
	*/
	constructor(verts, color, size, gl) {
		this.gl = gl;
		this.verts = verts;
		this.color = color;
		this.size = size;
		this.genShaders();
		this.genBuffers();
	}
};

class Collider {
	ccw(a, b, c) {
		return ((b.x - a.x)*(c.y - a.y)) - ((b.y - a.y)*(c.x - a.x));
	}

	// Graham scan
	getConvexHull() {
		/** @type {Array<Point>} */
		let points = minkowskiDifference(this.shape1, this.shape2);
		let stack = [];

		let bottomLeft = points[0];
		let bottomLeftIndex = 0;
		for (let i=0; i<points.length; i++) {
			let x = points[i];
			if (x.y <= bottomLeft.y) {
				if (x.y == bottomLeft.y) {
					if (x.x <= bottomLeft.x) {bottomLeft = x; bottomLeftIndex = i;}
					else continue;
				} else {bottomLeft = x; bottomLeftIndex = i;}
			}
		}
		points.splice(bottomLeftIndex, 1);
		
		points.sort((x, y) => {
			let a = new Point(x.x-bottomLeft.x, x.y-bottomLeft.y); let aLen = Math.sqrt(a.x**2 + a.y**2);
			let b = new Point(y.x-bottomLeft.x, y.y-bottomLeft.y); let bLen = Math.sqrt(b.x**2 + b.y**2);
			let aCos = a.x/aLen;
			let bCos = b.x/bLen;

			if (aCos < bCos) return 1;
			else if (aCos == bCos) return 0;
			else return -1;
		});

		let prevPoint = Point;
		for(let i=0; i<points.length; i++) {
			let a = new Point(points[i].x-bottomLeft.x, points[i].y-bottomLeft.y); let aLen = Math.sqrt(a.x**2 + a.y**2);
			let b = new Point(prevPoint.x-bottomLeft.x, prevPoint.y-bottomLeft.y); let bLen = Math.sqrt(b.x**2 + b.y**2);
			let aCos = a.x/aLen;
			let bCos = b.x/bLen;
			if (aCos == bCos) {
				if (aLen < bLen) points.splice(i, 1);
				else {points.splice(i-1, 1); prevPoint = points[i-1];}
				i--;
			}
			else prevPoint = points[i];
		}

		points.push(bottomLeft);

		points.forEach((x) => {
			while (stack.length > 1 && this.ccw(stack[stack.length-2], stack[stack.length-1], x) <= 0) stack.pop();
			stack.push(x);
		});

		return stack;
	}

	get hasCollided() {
		return isPointWithinShape(this.origin, this.convexHull);
	}

	update() {
		this.pointCloud.updateVBO(minkowskiDifference(this.shape1, this.shape2));
		this.convexHull.updateVBO(this.getConvexHull());
		this.shape1.handleCollision(this.hasCollided);
		this.shape2.handleCollision(this.hasCollided);
		// console.log(this.hasCollided);
		// if (this.hasCollided) console.log(this.shape1, this.shape2);
	}

	draw() {
		this.pointCloud.draw();
		this.convexHull.draw();
	}

	genPointCloud() {
		this.pointCloud = new PointCloud(minkowskiDifference(this.shape1, this.shape2), [0.3, 0.3, 1.0, 0.7], 4.5, this.gl);
	}

	genHullShape() {
		this.convexHull = new Shape(this.getConvexHull(), this.gl, [1.0, 0.0, 1.0, 0.7], this.gl.DYNAMIC_DRAW);
	}

	/**
	 * @param {Shape} x 
	 * @param {Shape} y 
	 * @param {WebGL2RenderingContext} gl
	 */
	constructor(x, y, gl) {
		this.gl = gl;
		this.shape1 = x;
		this.shape2 = y;
		this.origin = new Point(0.0, 0.0);
		this.genPointCloud();
		this.genHullShape();
	}
};

/**
 * @param {Shape} x 
 * @param {Shape} y
 */
function minkowskiDifference(x, y) {
	const transformedX = M3xListP2(x.transformMatrix, x.verts);
	const transformedY = M3xListP2(y.transformMatrix, y.verts);

	let out = [];

	transformedX.forEach((i) => {
		transformedY.forEach((j) => {
			out.push(new Point(i.x - j.x, i.y - j.y));
		});
	});

	return out;
}

const shape1Verts = [new Point(-0.25, -0.25), new Point(0.75, -0.25), new Point(-0.25, 0.75)];
const shape2Verts = [new Point(-0.5, -0.5), new Point(0.5, -0.5), new Point(0.5, 0.5), new Point(-0.5, 0.5)];
const shape3Verts = [new Point(0.0, 0.0), new Point(0.4, 0.3), new Point(-1.0, 0.5), new Point(0.3, -0.4), new Point(-0.3, 0.2)];
const colliders = [];
let origin = PointCloud;

var mousePos = new Point(-1.0, -1.0);
var mouseDown = false;
var mouseClicked = false;
const keysPressed = {
	leftArrow: false,
	rightArrow: false,
	upArrow: false,
	downArrow: false,
	w: false,
	a: false,
	s: false,
	d: false
};

function getKey(code) {
	switch(code) {
		case 37:
			return "leftArrow";
		case 38:
			return "upArrow";
		case 39:
			return "rightArrow";
		case 40:
			return "downArrow";
		case 87:
			return "w";
		case 65:
			return "a";
		case 83:
			return "s";
		case 68:
			return "d";
		default:
			return null;
	}
}

/**
 * @param {Array<Shape>} drawArr 
 * @param {WebGL2RenderingContext} gl 
 */
function gameloop(drawArr, gl) {
	gl.clear(gl.COLOR_BUFFER_BIT);

	drawArr.forEach((x) => {
		x.draw();
		x.handleInput(mousePos, mouseDown, mouseClicked, keysPressed);
	});

	colliders.forEach((x) => {
		x.update();
		x.draw();
	});

	origin.draw();

	mouseClicked = false;
}

function main() {
	/** @type {HTMLCanvasElement} */
	let canvas = document.getElementById("mainCanvas");
	/** @type {WebGL2RenderingContext} */
	let gl = canvas.getContext("webgl2");

	gl.viewport(0, 0, canvas.width, canvas.height);
	gl.clearColor(0.9, 0.9, 0.9, 1.0);

	const shape1 = new Shape(shape1Verts, gl);
	const shape2 = new Shape(shape2Verts, gl);
	const shape3 = new Shape(shape3Verts, gl);

	origin = new PointCloud([new Point(0.0, 0.0)], [0.0, 0.0, 0.0, 0.5], 5.0, gl);

	{
		canvas.addEventListener("mousemove", (e) => {
			mousePos = getMousePos(e, canvas);
		});

		canvas.addEventListener("mousedown", (e) => {
			mouseDown = true;
			mouseClicked = true;
		});

		canvas.addEventListener("mouseup", (e) => {
			mouseDown = false;
		});

		document.addEventListener("keydown", (e) => {
			let key = getKey(e.keyCode);
			if (key) keysPressed[key] = true;
		});

		document.addEventListener("keyup", (e) => {
			let key = getKey(e.keyCode);
			if (key) keysPressed[key] = false;
		});
	}

	const shapeArr = [shape1, shape2, shape3];

	for (let i=0; i<shapeArr.length; i++) {
		for (let j=i; j<shapeArr.length; j++) {
			if (i == j) continue;
			colliders.push(new Collider(shapeArr[i], shapeArr[j], gl));
		}
	}

	const fps = 60;
	setInterval(gameloop, 1000/fps, shapeArr, gl);
}

window.HTMLBodyElement.onload = main();