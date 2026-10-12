use bevy::prelude::*;

/// Small xorshift generator so gameplay variation does not need extra crates.
#[derive(Resource)]
pub struct Rng(u64);

impl Default for Rng {
    fn default() -> Self {
        let seed = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos() as u64)
            .unwrap_or(0x9E37_79B9_7F4A_7C15);
        Self::seeded(seed)
    }
}

impl Rng {
    pub fn seeded(seed: u64) -> Self {
        Self(seed | 1)
    }

    pub fn next_u32(&mut self) -> u32 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        (self.0 >> 32) as u32
    }

    pub fn f32(&mut self) -> f32 {
        self.next_u32() as f32 / u32::MAX as f32
    }

    pub fn range(&mut self, a: f32, b: f32) -> f32 {
        a + (b - a) * self.f32()
    }

    pub fn index(&mut self, n: usize) -> usize {
        self.next_u32() as usize % n.max(1)
    }

    pub fn chance(&mut self, p: f32) -> bool {
        self.f32() < p
    }

    /// Random unit vector inside a cone of `angle` radians around `dir`.
    pub fn cone(&mut self, dir: Vec3, angle: f32) -> Vec3 {
        let side = dir.any_orthonormal_vector();
        let up = dir.cross(side);
        let r = angle * self.f32().sqrt();
        let a = self.range(0.0, std::f32::consts::TAU);
        (dir + side * r * a.cos() + up * r * a.sin()).normalize()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cone_stays_within_spread() {
        let mut rng = Rng::seeded(7);
        for _ in 0..1000 {
            let v = rng.cone(Vec3::NEG_Z, 0.065);
            assert!((v.length() - 1.0).abs() < 1e-4);
            assert!(v.angle_between(Vec3::NEG_Z) <= 0.066);
        }
    }

    #[test]
    fn ranges_and_indices_stay_in_bounds() {
        let mut rng = Rng::seeded(99);
        for _ in 0..1000 {
            let x = rng.range(2.0, 3.0);
            assert!((2.0..=3.0).contains(&x));
            assert!(rng.index(4) < 4);
        }
    }
}
