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
  private rafId: number | null = null;

  @Output() dragMove = new EventEmitter<number>();
  @Output() slideChange = new EventEmitter<'next' | 'prev'>();

  private getClientX(event: MouseEvent | TouchEvent): number {
    return event instanceof MouseEvent ? event.clientX : event.touches[0].clientX;
  }

  @HostListener('mousedown', ['$event'])
  @HostListener('touchstart', ['$event'])
  onStart(event: MouseEvent | TouchEvent) {
    event.preventDefault();
    this.isDragging = true;
    this.startX = this.getClientX(event);

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

    if (Math.abs(deltaX) > this.threshold) {
      this.slideChange.emit(deltaX > 0 ? 'prev' : 'next');
    }
    this.dragMove.emit(0);

    document.removeEventListener('mousemove', this.onMove);
    document.removeEventListener('touchmove', this.onMove);
    document.removeEventListener('mouseup', this.onEnd);
    document.removeEventListener('touchend', this.onEnd);
  };

  // @HostListener('mousedown', ['$event'])
  // @HostListener('touchstart', ['$event'])
  // onStart(event: MouseEvent | TouchEvent) {
  //   event.preventDefault();
  //   this.isDragging = true;
  //   this.startX = this.getClientX(event);
  // }

  // @HostListener('mousemove', ['$event'])
  // @HostListener('touchmove', ['$event'])
  // onMove(event: MouseEvent | TouchEvent) {
  //   event.preventDefault();
  //   if (!this.isDragging) return;
  //   this.currentX = this.getClientX(event);
  //   const deltaX = this.currentX - this.startX;
  //   this.dragMove.emit(deltaX);
  // }

  // @HostListener('mouseup')
  // @HostListener('touchend')
  // onEnd() {
  //   if (!this.isDragging) return;
  //   this.isDragging = false;
  //   const deltaX = this.currentX - this.startX;

  //   if (Math.abs(deltaX) > this.threshold) {
  //     this.slideChange.emit(deltaX > 0 ? 'prev' : 'next')
  //   }
  //   this.dragMove.emit(0);
  // }
}
