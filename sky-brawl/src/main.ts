import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, GRAVITY_Y, BLAST_PADDING, HUD_FONT } from './constants';
import { Fighter } from './fighter';

class BrawlScene extends Phaser.Scene {
  private p1!: Fighter;
  private p2!: Fighter;

  private platforms!: Phaser.Physics.Arcade.StaticGroup;

  private p1Spawn = { x: GAME_WIDTH * 0.35, y: GAME_HEIGHT * 0.2 };
  private p2Spawn = { x: GAME_WIDTH * 0.65, y: GAME_HEIGHT * 0.2 };

  private hitboxes: Set<Phaser.GameObjects.Rectangle> = new Set();

  constructor() {
    super('BrawlScene');
  }

  preload() {}

  create() {
    // Create a 1x1 white texture to scale for platforms
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 1);
    g.fillRect(0, 0, 4, 4);
    g.generateTexture('pixel', 4, 4);
    g.destroy();

    this.physics.world.gravity.y = GRAVITY_Y;

    // Background grid
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x0b1020).setDepth(-10);
    this.drawBackgroundDecor();

    // Platforms
    this.platforms = this.physics.add.staticGroup();
    this.createPlatform(GAME_WIDTH / 2, GAME_HEIGHT * 0.85, GAME_WIDTH * 0.6, 30, 0x34495e);
    this.createPlatform(GAME_WIDTH * 0.35, GAME_HEIGHT * 0.6, 200, 20, 0x3d566e);
    this.createPlatform(GAME_WIDTH * 0.65, GAME_HEIGHT * 0.6, 200, 20, 0x3d566e);
    this.createPlatform(GAME_WIDTH / 2, GAME_HEIGHT * 0.4, 260, 20, 0x2e4053);

    // Players
    const controlsP1 = {
      left: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      up: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      attack: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.J),
    };
    const controlsP2 = {
      left: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT),
      right: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT),
      up: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.UP),
      down: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN),
      attack: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.NUMPAD_ONE),
    };

    this.p1 = new Fighter(this, { displayName: 'Comet', color: 0x5dade2, spawnX: this.p1Spawn.x, spawnY: this.p1Spawn.y, controls: controlsP1 });
    this.p2 = new Fighter(this, { displayName: 'Blaze', color: 0xec7063, spawnX: this.p2Spawn.x, spawnY: this.p2Spawn.y, controls: controlsP2 });

    // Colliders
    this.physics.add.collider(this.p1.rect, this.platforms);
    this.physics.add.collider(this.p2.rect, this.platforms);
    this.physics.add.collider(this.p1.rect, this.p2.rect);

    // HUD
    const p1Hud = this.add.text(20, 16, '', { font: HUD_FONT }).setScrollFactor(0);
    const p2Hud = this.add.text(GAME_WIDTH - 220, 16, '', { font: HUD_FONT }).setScrollFactor(0);
    this.p1.setHUD(p1Hud);
    this.p2.setHUD(p2Hud);

    // Track hitboxes created each frame for overlap checks
    this.events.on(Phaser.Scenes.Events.UPDATE, () => {
      // Collect new rectangles that have attackMeta
      this.children.list.forEach((obj) => {
        if ((obj as any).attackMeta && obj instanceof Phaser.GameObjects.Rectangle) {
          this.hitboxes.add(obj);
        }
      });

      // Clean out destroyed ones
      this.hitboxes.forEach((hb) => {
        if (!hb.active) this.hitboxes.delete(hb);
      });
    });
  }

  update(time: number, delta: number) {
    this.p1.update(time, delta);
    this.p2.update(time, delta);

    // Overlap detection for attacks
    this.hitboxes.forEach((hb) => {
      this.physics.world.overlap(hb, this.p1.rect, () => this.p1.tryApplyHitFrom(hb, time));
      this.physics.world.overlap(hb, this.p2.rect, () => this.p2.tryApplyHitFrom(hb, time));
    });

    // Out-of-bounds check
    const minX = -BLAST_PADDING;
    const maxX = GAME_WIDTH + BLAST_PADDING;
    const minY = -BLAST_PADDING;
    const maxY = GAME_HEIGHT + BLAST_PADDING;

    if (!this.isWithin(this.p1.rect.x, this.p1.rect.y, minX, minY, maxX, maxY)) {
      this.p1.outOfBoundsReset(this.p1Spawn.x, this.p1Spawn.y);
    }
    if (!this.isWithin(this.p2.rect.x, this.p2.rect.y, minX, minY, maxX, maxY)) {
      this.p2.outOfBoundsReset(this.p2Spawn.x, this.p2Spawn.y);
    }
  }

  private isWithin(x: number, y: number, minX: number, minY: number, maxX: number, maxY: number) {
    return x >= minX && x <= maxX && y >= minY && y <= maxY;
  }

  private createPlatform(x: number, y: number, width: number, height: number, color: number) {
    const img = this.add.image(x, y, 'pixel').setDisplaySize(width, height).setTint(color).setDepth(-1);
    const staticBody = this.physics.add.existing(img, true) as Phaser.Physics.Arcade.StaticBody;
    staticBody.updateFromGameObject();
  }

  private drawBackgroundDecor() {
    const stripes = this.add.graphics();
    stripes.lineStyle(2, 0x132235, 1);
    for (let i = -GAME_HEIGHT; i < GAME_WIDTH * 2; i += 60) {
      stripes.beginPath();
      stripes.moveTo(i, 0);
      stripes.lineTo(i + GAME_HEIGHT, GAME_HEIGHT);
      stripes.strokePath();
    }
    stripes.setAlpha(0.3).setDepth(-9);
  }
}

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'app',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#0b1020',
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: GRAVITY_Y },
      debug: false,
    },
  },
  scene: [BrawlScene],
};

new Phaser.Game(config);