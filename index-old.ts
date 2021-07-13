import {
  matrix,
  transpose,
  identity,
  multiply,
  add,
  inv,
  Matrix,
} from "mathjs";

// if positive returns the num, otherwise 0
// needed for constructing the basis matrix
const pos = (val: number) => Math.max(val, 0);

/**
 * See:
 *
 *  - https://datacadamia.com/data/type/number/function/cubic_spline
 *  - https://towardsdatascience.com/ridge-regression-for-better-usage-2f19b3a202db
 */

interface Point {
  x: number;
  y: number;
}
export default class SmoothingSpline {
  data: Point[];
  lambda: number;
  betas: Matrix | null;

  constructor(collectionOfPoints: Point[], { lambda = 0.5 } = {}) {
    this.data = collectionOfPoints;
    // scaling lambda ... confused about why we need to do this?
    // this.lambda = 0.00001 * Math.pow(2, lambda);
    this.lambda = lambda;
    this.betas = null;
  }

  getAllXs() {
    return this.data.map((pt) => pt.x);
  }

  getAllYs() {
    return this.data.map((pt) => pt.y);
  }

  setLambda(lambda: number) {
    this.lambda = lambda;
  }

  // creates a matrix M and vector y s.t. M*β = y
  getBasisMatrix() {
    // Given a set of n data points from i = 0 ... n-1
    // create a row:
    // 1, x_i, x_i^2, x_i^3, pos((x_i - x_0)^3), pos((x_i - x_1)^3, ..., (x_i - x_n-1)^3
    //
    // where:
    // - x_i is the ith data point from our collection
    // - pos() returns the positive part of the expression, otherwise 0.
    const M = [];

    for (let i = 0; i < this.data.length; i++) {
      const { x } = this.data[i];
      const row = [
        1,
        x,
        x ** 2,
        x ** 3,
        ...this.getAllXs().map((x_k) => pos(x - x_k) ** 3),
      ];
      M.push(row);
    }

    return matrix(M);
  }

  /**
   * uses Ridge Regression to solve for the β, the coeffecients of
   * the smoothing spline regression: M*β = y
   *
   *  β̂ = inverseMatrix(transposed(M) * M + λ*I) * transposed(M) * y`
   **/

  solveForBetas(): Promise<Matrix> {
    return new Promise((resolve, reject) => {
      const M = this.getBasisMatrix();
      // create a column vector y from all the y values of data
      const yRowVector = matrix(this.getAllYs());
      const yColVector = transpose(yRowVector);
      const Mtransposed = transpose(M);

      // calcuate inner of the inverse: transposed(X) * X + λ*I
      const transMdotM = multiply(Mtransposed, M);
      const rowsOfTransMdotM = transMdotM.size()[0];
      const ident = identity(rowsOfTransMdotM) as Matrix;
      const lambdaIdent = multiply(this.lambda, ident) as Matrix;
      const inner = add(transMdotM, lambdaIdent) as Matrix;

      let inverseInner;
      try {
        inverseInner = inv(inner) as Matrix;
      } catch (err) {
        return reject(
          `No inverse for inner matrix (transposed(M) * M + λ*I): ${err.message}`
        );
      }

      const productOfInverseInnerAndTransM = multiply(
        inverseInner,
        Mtransposed
      );
      const betas = multiply(productOfInverseInnerAndTransM, yColVector);
      resolve(betas);
    });
  }

  // returns a y for a given x
  basisColVector(x: number) {
    return transpose(
      matrix([
        1,
        x,
        x ** 2,
        x ** 3,
        ...this.getAllXs().map((x_k) => pos(x - x_k) ** 3),
      ])
    );
  }

  async getPoints() {
    const minX = Math.min(...this.getAllXs());
    const maxX = Math.max(...this.getAllXs());
    const stepSize = (maxX - minX) / 1000;
    const splinePoints = [];
    const betas = await this.solveForBetas();

    for (let i = minX; i <= maxX; i += stepSize) {
      const col = this.basisColVector(i);
      const y = multiply(betas, col);
      const pt = { x: i, y };
      splinePoints.push(pt);
    }
    return splinePoints;
  }
}
