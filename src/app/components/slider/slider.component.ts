import { isPlatformServer } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { AfterViewInit, ChangeDetectionStrategy, Component, computed, DestroyRef, effect, ElementRef, EventEmitter, Inject, inject, Input, NgZone, OnInit, Output, PLATFORM_ID, signal, ViewChild, WritableSignal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TouchDragDirective } from '../../directives/touch-drag.directive';
import { animationFrameScheduler, fromEvent, interval, Subscription } from 'rxjs';
import { Router } from '@angular/router';

export interface BrandingSlide {
  id: number;
  desktopImg: string;
  mobileImg: string;
  title: string;
  text: string;
  contentImg: string;
  cta?: Cta[];
}
export interface Cta {
  label: string;
  link?: string;
  type?: 'internal' | 'external';
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
  private router = inject(Router);
  private ngZone = inject(NgZone);

  @ViewChild('sliderContainer') sliderContainer!: ElementRef;
  @ViewChild('slider') slider!: ElementRef;

  @Input() autoSlideInterval: number = 5000;
  @Input() transitionInterval: number = 500;
  @Input() isLoop: boolean = true;
  @Input() randomInit = false;
  @Input() trackClicks = false;
  @Input() showExtras = true;
  @Output() trackClick = new EventEmitter<{ slide: BrandingSlide; slideIndex: number; cta?: Cta; ctaIndex?: number }>();

  isServer: boolean;
  currentIndex = signal(0);
  slides = signal<({ isVisible: WritableSignal<boolean>; isLoaded: WritableSignal<boolean> } & BrandingSlide)[]>([]);
  dragDelta = signal(0);
  isAnimating = signal(false);
  screenWidth = signal(1);
  transition = signal(`transform ${this.transitionInterval}ms ease`);
  pageVisible = signal(true);
  inViewport = signal(true);

  isInterective = computed(() => this.slides().length > 1);

  slidesForRender = computed<({ isVisible: WritableSignal<boolean>; isLoaded: WritableSignal<boolean> } & BrandingSlide & { isClone?: boolean })[]>(() => {
    const arr = this.slides();
    if (arr.length === 0) return [];

    const first = { ...arr[0], isClone: true, isVisible: signal(arr[0].isVisible()), isLoaded: signal(arr[0].isLoaded()) };
    const last = { ...arr[arr.length - 1], isClone: true, isVisible: signal(arr[arr.length - 1].isVisible()), isLoaded: signal(arr[arr.length - 1].isLoaded()) };

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

  isWideScreen = computed(() => this.screenWidth() >= 1024);

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

    effect(() => {
      if (this.isServer) return;
      const initRun = this.autoSlideInterval > 0 && this.isInterective() && this.pageVisible() && this.inViewport();
      if (initRun) {
        if (!this.autoSlideSub) this.startAutoSlide();
      } else {
        if (this.autoSlideSub) this.pauseAutoSlide();
      }
    });
  }

  ngOnInit(): void {
    this.loadSlides();
  }

  ngAfterViewInit(): void {
    if (!this.isServer) {
      /**
       * Stops slider when browser was switched to another tab
      */
      const onVisible = () => this.pageVisible.set(!document.hidden);
      document.addEventListener('visibilitychange', onVisible);
      this.destroyRef.onDestroy(() => document.removeEventListener('visibilitychange', onVisible));

      requestAnimationFrame(() => {
        this.transition.set(`transform ${this.transitionInterval}ms ease`);
      });

      this.initLazyLoading();
      this.observeViewport();
    };
  }

  isRenderIndexActive(renderIndex: number) {
    const slides = this.slidesForRender();
    if (!slides.length) return false;

    const slide = slides[renderIndex];
    if (slide.isClone) return false;

    return renderIndex === this.currentIndex() + 1;
  };

  getRealSlideIndex(rendererIndex: number): number {
    const length = this.slides().length;
    if (!length) return 0;
    if (rendererIndex === 0) return length - 1;
    if (rendererIndex === length + 1) return 0;
    return rendererIndex - 1;
  }

  loadSlides() {
    this.http.get<{ slides: BrandingSlide[] }>('/assets/slides.json').pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
      next: (data) => {
        if (!Array.isArray(data.slides)) {
          this.slides.set([]);
          return;
        }
        this.slides.set(data.slides.map(slide => ({ ...slide, isVisible: signal(false), isLoaded: signal(false) })));

        if (data.slides.length > 0) {
          let startIndex = 0;
          if (this.randomInit && data.slides.length > 1) {
            startIndex = Math.floor(Math.random() * data.slides.length);
          }
          // this.transition.set('none');
          this.currentIndex.set(startIndex);
          this.slides()[startIndex].isVisible.set(true);
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
          this.slidesForRender()[index].isLoaded.set(true);
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1 });

    const slideElements = this.sliderContainer.nativeElement.querySelectorAll('.slide');
    slideElements.forEach((slide: HTMLElement, index: number) => {
      slide.setAttribute('data-index', index.toString());
      observer.observe(slide);
    });

    this.destroyRef.onDestroy(() => observer.disconnect());
  }

  private observeViewport() {
    const el = this.sliderContainer.nativeElement;
    const io = new IntersectionObserver(([entry]) => {
      this.inViewport.set(entry.isIntersecting);
    }, { threshold: 0.01 });
    io.observe(el);
    this.destroyRef.onDestroy(() => io.disconnect());
  };

  isSlideVisible(renderIndex: number) {
    return Math.abs(renderIndex - (this.currentIndex() + 1)) <= 1;
  };

  onImageLoad(renderIndex: number) {
    const slidesArray = this.slidesForRender();
    if (!slidesArray.length) return;

    slidesArray[renderIndex].isVisible.set(true);
    slidesArray[renderIndex].isLoaded.set(true);
  }

  next() {
    if (this.slides().length === 0) return;
    this.isAnimating.set(true);
    this.currentIndex.update(i => i + 1);
    this.waitTransitionEnd(() => {
      this.checkLoop();
      this.isAnimating.set(false);
    });
  }

  prev() {
    if (this.slides().length === 0) return;
    this.isAnimating.set(true);
    this.currentIndex.update(i => i - 1);
    this.waitTransitionEnd(() => {
      this.checkLoop();
      this.isAnimating.set(false);
    });
  }

  checkLoop() {
    const lastIndex = this.slides().length - 1;

    if (this.currentIndex() > lastIndex) {
      this.transition.set('none');
      this.currentIndex.set(0);
      requestAnimationFrame(() => this.transition.set(`transform ${this.transitionInterval}ms ease`));
    }
    if (this.currentIndex() < 0) {
      this.transition.set('none');
      this.currentIndex.set(lastIndex);
      requestAnimationFrame(() => this.transition.set(`transform ${this.transitionInterval}ms ease`));
    }
  };

  onSlideChange(direction: 'next' | 'prev') {
    direction === 'next' ? this.next() : this.prev();
  }

  onDragMove(deltaX: number) {
    if (!this.isInterective() || this.isAnimating()) return;
    this.dragDelta.set(deltaX);
  };

  onDragEnd(event: { deltaX: number; shouldSwitch: boolean }) {
    if (!event.shouldSwitch) {
      this.dragDelta.set(0);
    } else {
      this.dragDelta.set(0);
    }
  }

  onCtaClick(event: MouseEvent, slide: BrandingSlide, cta: Cta, slideIndex: number, ctaIndex: number) {
    event.stopPropagation();

    if (this.trackClicks) {
      this.trackClick.emit({ slide, slideIndex, cta, ctaIndex });
    }

    if (cta.link) {
      const isExternal = /^https?:\/\//.test(cta.link) || cta.type === 'external';
      if (isExternal) {
        window.open(cta.link, '_blank');
      } else {
        this.ngZone.run(() => {
          this.router.navigate([cta.link]);
        });
      }
    }
  };

  onSlideClick() {
    console.log('slide clicked');
  }

  startAutoSlide() {
    if (this.autoSlideInterval > 0 && this.isInterective()) {
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
    if (!this.autoSlideSub && this.autoSlideInterval > 0 && this.isInterective()) {
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
    if (this.isServer || !this.slider?.nativeElement) {
      this.transition.set(`transform ${this.transitionInterval}ms ease`);
      return;
    }
    requestAnimationFrame(() => this.transition.set(`transform ${this.transitionInterval}ms ease`));
  }

  goToSlide(index: number) {
    const total = this.slides().length;
    const current = this.activeIndex();

    if (index === current) return;

    this.isAnimating.set(true);

    this.transition.set(`transform ${this.transitionInterval}ms ease`);

    if (current === total - 1 && index === 0) {
      this.currentIndex.set(total);
      this.waitTransitionEnd(() => {
        this.jumpWithoutAnimation(0);
        this.isAnimating.set(false);
      });
      return;
    }
    if (current === 0 && index === total - 1) {
      this.currentIndex.set(-1);
      this.waitTransitionEnd(() => {
        this.jumpWithoutAnimation(total - 1);
        this.isAnimating.set(false);
      });
      return;
    }
    this.currentIndex.set(index);
    this.waitTransitionEnd(() => this.isAnimating.set(false));
  }
}
