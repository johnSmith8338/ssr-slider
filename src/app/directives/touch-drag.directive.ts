import { Directive, ElementRef, EventEmitter, HostListener, inject, NgZone, Output } from '@angular/core';

@Directive({
  selector: '[appTouchDrag]',
  standalone: true,
})
export class TouchDragDirective {
  el = inject(ElementRef);
  private ngZone = inject(NgZone);

  private startX = 0;
  private currentX = 0;
  private isDragging = false;
  private threshold = 50; // how many px we should drag to switch slide
  private clickThreshold = 5;
  private rafId: number | null = null;

  @Output() dragMove = new EventEmitter<number>();
  @Output() dragEnd = new EventEmitter<{ deltaX: number, shouldSwitch: boolean }>();
  @Output() slideChange = new EventEmitter<'next' | 'prev'>();
  @Output() slideClick = new EventEmitter<void>();

  private getClientX(event: MouseEvent | TouchEvent): number {
    return event instanceof MouseEvent ? event.clientX : event.touches[0].clientX;
  }

  @HostListener('mousedown', ['$event'])
  @HostListener('touchstart', ['$event'])
  onStart(event: MouseEvent | TouchEvent) {
    event.preventDefault();
    this.isDragging = true;
    this.startX = this.getClientX(event);
    this.currentX = this.startX;

    this.ngZone.runOutsideAngular(() => {
      document.addEventListener('mousemove', this.onMove, { passive: false });
      document.addEventListener('touchmove', this.onMove, { passive: false });
      document.addEventListener('mouseup', this.onEnd);
      document.addEventListener('touchend', this.onEnd);
    });
  }

  private onMove = (event: MouseEvent | TouchEvent) => {
    if (!this.isDragging) return;
    event.preventDefault();

    this.currentX = this.getClientX(event);
    const deltaX = this.currentX - this.startX;

    if (this.rafId == null) {
      this.rafId = requestAnimationFrame(() => {
        this.dragMove.emit(deltaX);
        this.rafId = null;
      });
    }
  }

  private onEnd = () => {
    if (!this.isDragging) return;
    this.isDragging = false;

    const deltaX = this.currentX - this.startX;
    const shouldSwitch = Math.abs(deltaX) > this.threshold;

    if (shouldSwitch) {
      this.slideChange.emit(deltaX > 0 ? 'prev' : 'next');
    } else {
      if (Math.abs(deltaX) < this.clickThreshold) {
        this.slideClick.emit();
      }
    }

    this.dragEnd.emit({ deltaX, shouldSwitch });

    document.removeEventListener('mousemove', this.onMove);
    document.removeEventListener('touchmove', this.onMove);
    document.removeEventListener('mouseup', this.onEnd);
    document.removeEventListener('touchend', this.onEnd);
  };
}
