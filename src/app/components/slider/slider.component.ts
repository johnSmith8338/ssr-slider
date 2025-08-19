import { isPlatformServer } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { AfterViewInit, ChangeDetectionStrategy, Component, computed, DestroyRef, ElementRef, Inject, inject, Input, OnInit, PLATFORM_ID, signal, ViewChild, WritableSignal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TouchDragDirective } from '../../directives/touch-drag.directive';
import { animationFrameScheduler, fromEvent, interval, Subscription } from 'rxjs';

export interface BrandingSlide {
  id: number;
  desktopImg: string;
  mobileImg: string;
  title: string;
  text: string;
  titleImgUrl: string;
}

@Component({
  selector: 'app-slider',
  standalone: true,
  imports: [
    TouchDragDirective,
  ],
  templateUrl: './slider.component.html',
  styleUrl: './slider.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SliderComponent implements OnInit, AfterViewInit {
  private http = inject(HttpClient);
  private destroyRef = inject(DestroyRef);

  @ViewChild('sliderContainer') sliderContainer!: ElementRef;
  @ViewChild('slider') slider!: ElementRef;

  @Input() autoSlideInterval: number = 5000;
  @Input() isLoop: boolean = true;

  isServer: boolean;
  currentIndex = signal(0);
  slides = signal<({ isVisible: import('@angular/core').WritableSignal<boolean> } & BrandingSlide)[]>([]);
  dragDelta = signal(0);
  screenWidth = signal(1);
  transition = signal('transform 0.5s ease');

  slidesForRender = computed<({ isVisible: WritableSignal<boolean> } & BrandingSlide & { isClone?: boolean })[]>(() => {
    const arr = this.slides();
    if (arr.length === 0) return [];

    const first = { ...arr[0], isClone: true, isVisible: signal(arr[0].isVisible()) };
    const last = { ...arr[arr.length - 1], isClone: true, isVisible: signal(arr[arr.length - 1].isVisible()) };

    return [last, ...arr, first];
  });

  transform = computed(() => {
    const width = this.screenWidth();
    const offset = width > 0 ? (this.dragDelta() / width) * 100 : 0;
    const base = -(this.currentIndex() + 1) * 100;
    return `translateX(${base + offset}%)`;
  });

  activeIndex = computed(() => {
    const index = this.currentIndex();
    const last = this.slides().length - 1;

    if (index < 0) return last;
    if (index > last) return 0;
    return index;
  });

  private autoSlideSub: Subscription | null = null;

  constructor(
    @Inject(PLATFORM_ID) platformId: Object,
  ) {
    this.isServer = isPlatformServer(platformId);

    if (!this.isServer) {
      this.screenWidth.set(window.innerWidth);

      fromEvent(window, 'resize').pipe(
        takeUntilDestroyed()
      ).subscribe(() => {
        this.screenWidth.set(window.innerWidth);
      });
    }
  }

  ngOnInit(): void {
    this.loadSlides();
    if (!this.isServer) this.startAutoSlide();
  }

  ngAfterViewInit(): void {
    if (!this.isServer) {
      this.initLazyLoading();

      /**
       * Stops slider when browser tab was switched to another tab
       */
      document.addEventListener('visibilitychange', () => {
        document.hidden ? this.pauseAutoSlide() : this.resumeAutoSlide();
      });
    };
  }

  isRenderIndexActive(renderIndex: number) {
    const slidesCount = this.slides().length;
    if (!slidesCount) return false;
    return renderIndex === this.currentIndex() + 1;
  };

  loadSlides() {
    this.http.get<{ slides: BrandingSlide[] }>('/assets/slides.json').pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
      next: (data) => {
        if (!Array.isArray(data.slides)) {
          console.error('Waiting for slide\'s array', data);
          this.slides.set([]);
          return;
        }
        this.slides.set(data.slides.map(slide => ({ ...slide, isVisible: signal(false) })));
        if (data.slides.length > 0) {
          this.slides()[0].isVisible.set(true);
        }
      },
      error: (err) => {
        console.log('Slides loading error', err);
        this.slides.set([]);
      }
    });
  }

  initLazyLoading() {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const index = parseInt(entry.target.getAttribute('data-index') || '0');
          this.slidesForRender()[index].isVisible.set(true);
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1 });

    const slideElements = this.sliderContainer.nativeElement.querySelectorAll('.slide');
    slideElements.forEach((slide: HTMLElement, index: number) => {
      slide.setAttribute('data-index', index.toString());
      observer.observe(slide);
    });
  }

  isSlideVisible(renderIndex: number) {
    return Math.abs(renderIndex - (this.currentIndex() + 1)) <= 1;
  };

  onImageLoad(renderIndex: number) {
    const slidesArray = this.slidesForRender();
    if (!slidesArray.length) return;

    slidesArray[renderIndex].isVisible.set(true);
  }

  next() {
    if (this.slides().length === 0) return;
    this.currentIndex.update(i => i + 1);
    setTimeout(() => this.checkLoop(), 500);
  }

  prev() {
    if (this.slides().length === 0) return;
    this.currentIndex.update(i => i - 1);
    setTimeout(() => this.checkLoop(), 500);
  }

  checkLoop() {
    const lastIndex = this.slides().length - 1;

    if (this.currentIndex() > lastIndex) {
      this.transition.set('none');
      this.currentIndex.set(0);
      requestAnimationFrame(() => this.transition.set('transform 0.5s ease'));
    }
    if (this.currentIndex() < 0) {
      this.transition.set('none');
      this.currentIndex.set(lastIndex);
      requestAnimationFrame(() => this.transition.set('transform 0.5s ease'));
    }
  };

  onSlideChange(direction: 'next' | 'prev') {
    direction === 'next' ? this.next() : this.prev();
  }

  onDragMove(deltaX: number) {
    this.dragDelta.set(deltaX);
  };

  startAutoSlide() {
    if (this.autoSlideInterval > 0) {
      this.autoSlideSub?.unsubscribe();

      this.autoSlideSub = interval(this.autoSlideInterval, animationFrameScheduler).pipe(
        takeUntilDestroyed(this.destroyRef)
      ).subscribe(() => this.next());
    }
  }

  pauseAutoSlide() {
    this.autoSlideSub?.unsubscribe();
    this.autoSlideSub = null;
  }

  resumeAutoSlide() {
    if (!this.autoSlideSub && this.autoSlideInterval > 0) {
      this.startAutoSlide();
    }
  }

  private waitTransitionEnd(callbeck: () => void) {
    const el = this.sliderContainer.nativeElement;
    const handler = () => {
      el.removeEventListener('transitionend', handler);
      callbeck();
    };
    el.addEventListener('transitionend', handler);
  }

  private jumpWithoutAnimation(target: number) {
    this.transition.set('none');
    this.currentIndex.set(target);
    requestAnimationFrame(() => this.transition.set('transform 0.5s ease'));
  }

  goToSlide(index: number) {
    const total = this.slides().length;
    const current = this.activeIndex();

    if (index === current) return;

    this.transition.set('transform 0.5s ease');

    if (current === total - 1 && index === 0) {
      this.currentIndex.set(total);
      this.waitTransitionEnd(() => this.jumpWithoutAnimation(0));
      return;
    }
    if (current === 0 && index === total - 1) {
      this.currentIndex.set(-1);
      this.waitTransitionEnd(() => this.jumpWithoutAnimation(total - 1));
      return;
    }
    this.currentIndex.set(index);
  }
}
