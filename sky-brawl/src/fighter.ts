import Phaser from 'phaser';
import { ATTACK_COOLDOWN_MS, ATTACK_HITSTUN_MS, GRAVITY_Y, MAX_JUMPS, STOCKS_START } from './constants';
import type { AttackKind, Direction } from './types';

export type PlayerControls = {
  left: Phaser.Input.Keyboard.Key;
  right: Phaser.Input.Keyboard.Key;
  up: Phaser.Input.Keyboard.Key;
  down: Phaser.Input.Keyboard.Key;
  attack: Phaser.Input.Keyboard.Key;
};

export type FighterConfig = {
  displayName: string;
  color: number;
  spawnX: number;
  spawnY: number;
  controls: PlayerControls;
};

export class Fighter {
  readonly scene: Phaser.Scene;
  readonly displayName: string;
  readonly color: number;
  readonly rect: Phaser.GameObjects.Rectangle;
  readonly body: Phaser.Physics.Arcade.Body;
  readonly controls: PlayerControls;

  percent: number = 0;
  stocks: number = STOCKS_START;

  private isFacing: Direction = 'right';
  private jumpsUsed: number = 0;
  private lastAttackAtMs: number = -Infinity;
  private hitstunUntilMs: number = 0;

  private readonly width = 44;
  private readonly height = 60;

  hudText?: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, config: FighterConfig) {
    this.scene = scene;
    this.displayName = config.displayName;
    this.color = config.color;
    this.controls = config.controls;

    this.rect = scene.add.rectangle(config.spawnX, config.spawnY, this.width, this.height, config.color).setOrigin(0.5);
    scene.physics.add.existing(this.rect);
    this.body = this.rect.body as Phaser.Physics.Arcade.Body;
    this.body.setCollideWorldBounds(false);
    this.body.setDragX(1000);
    this.body.setMaxVelocity(800, 1800);
  }

  setHUD(text: Phaser.GameObjects.Text) {
    this.hudText = text;
    this.refreshHUD();
  }

  refreshHUD() {
    if (!this.hudText) return;
    this.hudText.setText(`${this.displayName}  ${this.stocks}★   ${Math.floor(this.percent)}%`);
    this.hudText.setColor(this.getHUDColor());
  }

  private getHUDColor(): string {
    const p = Math.min(999, this.percent);
    const r = Math.min(255, Math.floor((p / 300) * 255));
    const g = Math.max(0, 255 - Math.floor((p / 600) * 255));
    return `rgb(${r}, ${g}, 64)`;
  }

  update(timeMs: number, deltaMs: number) {
    const inHitstun = timeMs < this.hitstunUntilMs;

    const onGround = this.body.blocked.down;
    if (onGround) {
      this.jumpsUsed = 0;
    }

    if (!inHitstun) {
      this.handleMovement(deltaMs);
      this.handleJump(onGround);
      this.handleAttack(timeMs);
    }

    if (this.body.velocity.x !== 0) {
      this.isFacing = this.body.velocity.x > 0 ? 'right' : 'left';
    }
  }

  private handleMovement(deltaMs: number) {
    const moveSpeed = 500;
    const leftHeld = this.controls.left.isDown;
    const rightHeld = this.controls.right.isDown;

    if (leftHeld && !rightHeld) {
      this.body.setVelocityX(-moveSpeed);
    } else if (rightHeld && !leftHeld) {
      this.body.setVelocityX(moveSpeed);
    } else {
      // let drag handle slow-down
    }

    // Fast-fall if holding down in air
    if (!this.body.blocked.down && this.controls.down.isDown && this.body.velocity.y > 0) {
      this.body.setVelocityY(Math.min(this.body.velocity.y + 20, 1500));
    }
  }

  private handleJump(onGround: boolean) {
    const jumpPressed = Phaser.Input.Keyboard.JustDown(this.controls.up);
    if (jumpPressed) {
      if (onGround || this.jumpsUsed < MAX_JUMPS - 1) {
        this.body.setVelocityY(-800);
        if (!onGround) {
          this.jumpsUsed += 1;
        }
      }
    }
  }

  private handleAttack(nowMs: number) {
    if (!Phaser.Input.Keyboard.JustDown(this.controls.attack)) return;
    if (nowMs - this.lastAttackAtMs < ATTACK_COOLDOWN_MS) return;

    const kind = this.resolveAttackKind();
    this.lastAttackAtMs = nowMs;

    const { x, y } = this.rect;
    const facing = this.isFacing;

    let hbWidth = 70;
    let hbHeight = 40;
    let offsetX = facing === 'right' ? this.width / 2 + hbWidth / 2 : -this.width / 2 - hbWidth / 2;
    let offsetY = 0;

    if (kind === 'up') {
      hbWidth = 60;
      hbHeight = 60;
      offsetX = 0;
      offsetY = -this.height / 2 - hbHeight / 2;
    } else if (kind === 'down') {
      hbWidth = 50;
      hbHeight = 50;
      offsetX = 0;
      offsetY = this.height / 2 + hbHeight / 2;
    } else if (kind === 'neutral') {
      hbWidth = 60;
      hbHeight = 40;
      offsetX = 0;
      offsetY = 0;
    }

    const hitbox = this.scene.add.rectangle(x + offsetX, y + offsetY, hbWidth, hbHeight, 0xffffff, 0.15);
    this.scene.physics.add.existing(hitbox);
    const hbBody = hitbox.body as Phaser.Physics.Arcade.Body;
    hbBody.setAllowGravity(false);
    hbBody.setImmovable(true);

    hitbox.setDepth(10);

    // Lifespan of the hitbox
    this.scene.time.delayedCall(90, () => {
      hitbox.destroy();
    });

    // Store data on hit strength
    const baseKnockback = kind === 'down' ? 350 : kind === 'up' ? 380 : kind === 'neutral' ? 300 : 420;
    const percentScale = kind === 'down' ? 7 : 8.5;

    (hitbox as any).attackMeta = { baseKnockback, percentScale, kind, facing };
  }

  private resolveAttackKind(): AttackKind {
    if (this.controls.up.isDown) return 'up';
    if (this.controls.down.isDown) return 'down';
    if (this.controls.left.isDown || this.controls.right.isDown) return 'side';
    return 'neutral';
  }

  tryApplyHitFrom(hitbox: Phaser.GameObjects.Rectangle, nowMs: number) {
    const meta = (hitbox as any).attackMeta as | { baseKnockback: number; percentScale: number; kind: AttackKind; facing: Direction } | undefined;
    if (!meta) return;

    // Apply once per hitbox
    (hitbox as any).consumedFor = (hitbox as any).consumedFor || new Set<Fighter>();
    const consumed: Set<Fighter> = (hitbox as any).consumedFor;
    if (consumed.has(this)) return;
    consumed.add(this);

    const knockback = meta.baseKnockback + this.percent * meta.percentScale;

    // Direction
    let vx = 0;
    let vy = 0;
    if (meta.kind === 'up') {
      vx = meta.facing === 'right' ? 100 : -100;
      vy = -knockback;
    } else if (meta.kind === 'down') {
      vx = meta.facing === 'right' ? 80 : -80;
      vy = knockback * 0.6; // spike-ish
    } else if (meta.kind === 'neutral') {
      vx = meta.facing === 'right' ? knockback * 0.6 : -knockback * 0.6;
      vy = -knockback * 0.2;
    } else {
      vx = meta.facing === 'right' ? knockback : -knockback;
      vy = -knockback * 0.1;
    }

    this.percent += 8; // damage per hit

    this.body.setVelocity(vx, vy);
    this.hitstunUntilMs = nowMs + ATTACK_HITSTUN_MS;
    this.refreshHUD();
  }

  outOfBoundsReset(spawnX: number, spawnY: number) {
    this.stocks -= 1;
    this.percent = 0;
    this.rect.setPosition(spawnX, spawnY);
    this.body.setVelocity(0, 0);
    this.jumpsUsed = 0;
    this.hitstunUntilMs = 0;
    this.refreshHUD();
  }
}