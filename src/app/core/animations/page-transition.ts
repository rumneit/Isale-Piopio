import { createAnimation, AnimationBuilder } from '@ionic/angular';

/**
 * Chuyển trang nhanh: fade nhẹ + trượt lên 8px, 160ms (mặc định của Ionic ~300-350ms).
 * Cảm giác tức thì nhưng vẫn mượt.
 */
export const pageTransition: AnimationBuilder = (_baseEl: HTMLElement, opts?: any) => {
  const DURATION = 160;
  const enteringEl = opts?.enteringEl as HTMLElement | undefined;
  const leavingEl = opts?.leavingEl as HTMLElement | undefined;

  const root = createAnimation().duration(DURATION).easing('ease-out');

  if (enteringEl) {
    const enter = createAnimation()
      .addElement(enteringEl)
      .duration(DURATION)
      .fromTo('opacity', '0.01', '1')
      .fromTo('transform', 'translateY(10px)', 'translateY(0px)');
    root.addAnimation(enter);
  }

  if (leavingEl) {
    const leave = createAnimation()
      .addElement(leavingEl)
      .duration(Math.round(DURATION * 0.5))
      .fromTo('opacity', '1', '0.01');
    root.addAnimation(leave);
  }

  return root;
};
