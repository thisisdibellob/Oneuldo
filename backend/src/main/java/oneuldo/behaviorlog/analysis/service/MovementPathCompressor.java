package oneuldo.behaviorlog.analysis.service;

import java.util.*;

/** Time-aligned simplification. Zero tolerance preserves every sample, including equal samples. */
public final class MovementPathCompressor {
    public record Point(long timeMs, double x, double y) {}
    public record Result(List<Integer> retained, double observedDistance, double maxTimedError) {}

    public Result compress(List<Point> points, double tolerance) {
        if (!Double.isFinite(tolerance) || tolerance < 0) throw new IllegalArgumentException("INVALID_MOVEMENT_TOLERANCE");
        TreeSet<Integer> keep = new TreeSet<>();
        double distance = 0;
        boolean valid = true;
        for (int i=0;i<points.size();i++) {
            Point p=points.get(i);
            valid &= Double.isFinite(p.x) && Double.isFinite(p.y);
            if(i>0) {
                Point prev=points.get(i-1);
                distance += Math.hypot(p.x-prev.x,p.y-prev.y);
                valid &= p.timeMs>prev.timeMs;
            }
        }
        if (!valid || tolerance==0 || points.size()<3) {
            for(int i=0;i<points.size();i++) keep.add(i);
            return new Result(List.copyOf(keep),distance,0);
        }
        keep.add(0);keep.add(points.size()-1);
        // Preserve every observed stop and reversal, even when its size is below tolerance.
        for(int i=1;i<points.size()-1;i++) {
            Point a=points.get(i-1),b=points.get(i),c=points.get(i+1);
            double ux=b.x-a.x,uy=b.y-a.y,vx=c.x-b.x,vy=c.y-b.y;
            if((ux==0 && uy==0)||(vx==0 && vy==0)||ux*vx+uy*vy<=0||ux*vx<0||uy*vy<0) {
                keep.add(i-1);keep.add(i);keep.add(i+1);
            }
        }
        var boundaries=new ArrayList<>(keep);
        var work=new ArrayDeque<int[]>();
        for(int i=1;i<boundaries.size();i++) work.add(new int[]{boundaries.get(i-1),boundaries.get(i)});
        while(!work.isEmpty()) {
            int[] span=work.removeFirst(); int worst=-1;double error=tolerance;
            for(int i=span[0]+1;i<span[1];i++) {
                double e=error(points.get(span[0]),points.get(span[1]),points.get(i));
                if(e>error) {worst=i;error=e;}
            }
            if(worst>=0) {keep.add(worst);work.add(new int[]{span[0],worst});work.add(new int[]{worst,span[1]});}
        }
        var retained=List.copyOf(keep);
        double max=validate(points,retained,tolerance);
        return new Result(retained,distance,max);
    }

    public double validate(List<Point> points,List<Integer> retained,double tolerance) {
        if(points.isEmpty()) return 0;
        if(retained.isEmpty() || retained.getFirst()!=0 || retained.getLast()!=points.size()-1)
            throw new IllegalArgumentException("MOVEMENT_ENDPOINT_MISSING");
        double max=0;
        for(int k=1;k<retained.size();k++) {
            int a=retained.get(k-1),b=retained.get(k);
            if(b<=a || b>=points.size()) throw new IllegalArgumentException("MOVEMENT_ORDER_CHANGED");
            for(int i=a+1;i<b;i++) max=Math.max(max,error(points.get(a),points.get(b),points.get(i)));
        }
        if(!Double.isFinite(max)||max>tolerance) throw new IllegalArgumentException("MOVEMENT_TIME_ERROR_EXCEEDED");
        return max;
    }
    private double error(Point a,Point b,Point p) {
        double fraction=(double)(p.timeMs-a.timeMs)/(b.timeMs-a.timeMs);
        return Math.hypot(p.x-(a.x+(b.x-a.x)*fraction),p.y-(a.y+(b.y-a.y)*fraction));
    }
}
