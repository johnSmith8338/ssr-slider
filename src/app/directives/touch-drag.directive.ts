import { Directive, ElementRef, EventEmitter, HostListener, inject, Output } from '@angular/core';

@Directive({
  selector: '[appTouchDrag]',
  standalone: true,
})
export class TouchDragDirective {
  el = inject(ElementRef);

  private startX = 0;
  private currentX = 0;
  private isDragging = false;
  private threshold = 50; // how many px we should drag to switch slide

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
  }

  @HostListener('mousemove', ['$event'])
  @HostListener('touchmove', ['$event'])
  onMove(event: MouseEvent | TouchEvent) {
    event.preventDefault();
    if (!this.isDragging) return;
    this.currentX = this.getClientX(event);
    const deltaX = this.currentX - this.startX;
    this.dragMove.emit(deltaX);
  }

  @HostListener('mouseup')
  @HostListener('touchend')
  onEnd() {
    if (!this.isDragging) return;
    this.isDragging = false;
    const deltaX = this.currentX - this.startX;

    if (Math.abs(deltaX) > this.threshold) {
      this.slideChange.emit(deltaX > 0 ? 'prev' : 'next')
    }
    this.dragMove.emit(0);
  }
}
