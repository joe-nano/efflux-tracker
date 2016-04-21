/**
 * The MIT License (MIT)
 *
 * Igor Zinken 2016 - http://www.igorski.nl
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
var TemplateUtil  = require( "../utils/TemplateUtil" );
var Form          = require( "../utils/Form" );
var Messages      = require( "../definitions/Messages" );
var zCanvas       = require( "zCanvas" ).zCanvas;
var WaveTableDraw = require( "../components/WaveTableDraw" );
var Pubsub        = require( "pubsub-js" );

/* private properties */

var container, tracker, keyboardController, view, canvas, wtDraw,
    instrumentSelect, oscEnabledSelect, oscWaveformSelect, volumeControl,
    detuneControl, octaveShiftControl, fineShiftControl,
    attackControl, decayControl, sustainControl, releaseControl,
    frequencyControl, qControl, lfoSelect, filterSelect, speedControl, depthControl;

var activeOscillatorIndex = 0, instrumentId = 0, instrument;

var InstrumentController = module.exports =
{
    visible : false,

    init : function( containerRef, trackerRef, keyboardControllerRef )
    {
        container          = containerRef;
        tracker            = trackerRef;
        keyboardController = keyboardControllerRef;

        // prepare view

        view = document.createElement( "div" );
        view.setAttribute( "id", "instrumentEditor" );
        view.innerHTML = TemplateUtil.render( "instrumentEditor" );

        instrumentSelect   = view.querySelector( "#instrumentSelect" );
        oscEnabledSelect   = view.querySelector( "#oscillatorEnabled" );
        oscWaveformSelect  = view.querySelector( "#oscillatorWaveformSelect" );
        volumeControl      = view.querySelector( "#volume" );
        detuneControl      = view.querySelector( "#detune" );
        octaveShiftControl = view.querySelector( "#octaveShift" );
        fineShiftControl   = view.querySelector( "#fineShift" );
        attackControl      = view.querySelector( "#attack" );
        decayControl       = view.querySelector( "#decay" );
        sustainControl     = view.querySelector( "#sustain" );
        releaseControl     = view.querySelector( "#release" );
        frequencyControl   = view.querySelector( "#filterFrequency" );
        qControl           = view.querySelector( "#filterQ" );
        lfoSelect          = view.querySelector( "#filterLFO" );
        filterSelect       = view.querySelector( "#filterType" );
        speedControl       = view.querySelector( "#filterSpeed" );
        depthControl       = view.querySelector( "#filterDepth" );

        canvas = new zCanvas( 512, 200 ); // 512 equals the size of the wave table (see InstrumentFactory)
        canvas.setBackgroundColor( "#000000" );
        canvas.insertInPage( view.querySelector( "#canvasContainer" ));

        wtDraw = new WaveTableDraw( canvas.getWidth(), canvas.getHeight(), function( table )
        {
            if ( instrument ) {
                instrument.oscillators[ activeOscillatorIndex ].table = table;
                cacheOscillatorWaveForm( instrument.oscillators[ activeOscillatorIndex ] );
            }
        });

        // add listeners

        view.querySelector( "#oscillatorTabs" ).addEventListener( "click", handleOscillatorTabClick );
        instrumentSelect.addEventListener ( "change", handleInstrumentSelect );
        oscEnabledSelect.addEventListener ( "change", handleOscillatorEnabledChange );
        oscWaveformSelect.addEventListener( "change", handleWaveformChange );
        volumeControl.addEventListener    ( "input",  handleVolumeChange );

        [ detuneControl, octaveShiftControl, fineShiftControl ].forEach( function( control ) {
            control.addEventListener( "input", handleTuningChange );
        });

        [ attackControl, decayControl, sustainControl, releaseControl ].forEach( function( control ) {
            control.addEventListener( "input", handleEnvelopeChange );
        });

        lfoSelect.addEventListener   ( "change", handleFilterChange );
        filterSelect.addEventListener( "change", handleFilterChange );
        [ frequencyControl, qControl, speedControl, depthControl ].forEach( function( control ) {
            control.addEventListener( "input", handleFilterChange );
        });

        [ Messages.CLOSE_OVERLAYS, Messages.TOGGLE_INSTRUMENT_EDITOR ].forEach( function( msg )
        {
            Pubsub.subscribe( msg, handleBroadcast );
        });
    },

    update : function()
    {
        var instruments = tracker.activeSong.instruments, i = instruments.length;
        instrument = null;

        while ( i-- ) {
            if ( instruments[ i ].id == instrumentId ) {
                instrument = instruments[ i ];
                break;
            }
        }

        if ( !instrument )
            return;

        var tabs = view.querySelectorAll( "#oscillatorTabs li" ), tab;
        i = tabs.length;
        while ( i-- ) {
            tab = tabs[ i ].classList;
            if ( i === activeOscillatorIndex )
                tab.add( "active" );
            else
            tab.remove( "active" );
        }

        var oscillator = instrument.oscillators[ activeOscillatorIndex ];
        view.querySelector( "h2" ).innerHTML = "Editing " + instrument.name;
        wtDraw.setTable( oscillator.table );
        Form.setSelectedOption( oscEnabledSelect,  oscillator.enabled );
        Form.setSelectedOption( oscWaveformSelect, oscillator.waveform );
        Form.setSelectedOption( instrumentSelect,  instrument.id );

        detuneControl.value      = oscillator.detune;
        octaveShiftControl.value = oscillator.octaveShift;
        fineShiftControl.value   = oscillator.fineShift;
        volumeControl.value      = oscillator.volume;

        attackControl.value  = oscillator.adsr.attack;
        decayControl.value   = oscillator.adsr.decay;
        sustainControl.value = oscillator.adsr.sustain;
        releaseControl.value = oscillator.adsr.release;

        Form.setSelectedOption( lfoSelect,    instrument.filter.lfoType );
        Form.setSelectedOption( filterSelect, instrument.filter.type );
        frequencyControl.value = instrument.filter.frequency;
        qControl.value         = instrument.filter.q;
        speedControl.value     = instrument.filter.speed;
        depthControl.value     = instrument.filter.depth;

        canvas.invalidate();
    },

    handleKey : function( type, keyCode, event )
    {
        if ( type === "down" && keyCode === 27 )
            Pubsub.publishSync( Messages.CLOSE_OVERLAYS );
    }
};

/* private methods */

function handleBroadcast( type, payload )
{
    switch ( type )
    {
        case Messages.TOGGLE_INSTRUMENT_EDITOR:

            Pubsub.publishSync( Messages.CLOSE_OVERLAYS );
            container.appendChild( view );
            canvas.addChild( wtDraw );

            keyboardController.setListener( InstrumentController );
            instrumentId = payload;
            InstrumentController.update(); // sync with model
            break;

        case Messages.CLOSE_OVERLAYS:

            if ( view.parentNode ) {
                container.removeChild( view );
                canvas.removeChild( wtDraw );
            }
            break;
    }
}

function handleOscillatorTabClick( aEvent )
{
    var element = aEvent.target;
    if ( element.nodeName === "LI" ) {

        var value = parseFloat( element.getAttribute( "data-oscillator" ));
        if ( !isNaN( value )) {
            activeOscillatorIndex = value - 1;
            InstrumentController.update();
        }
    }
}

function handleTuningChange( aEvent )
{
    var oscillator = instrument.oscillators[ activeOscillatorIndex ],
        target     = aEvent.target,
        value      = parseFloat( target.value );

    switch ( target )
    {
        case detuneControl:
            oscillator.detune = value;
            break;

        case octaveShiftControl:
            oscillator.octaveShift = value;
            break;

        case fineShiftControl:
            oscillator.fineShift = value;
            break;
    }
    Pubsub.publishSync( Messages.ADJUST_OSCILLATOR_TUNING, [ instrumentId, activeOscillatorIndex, oscillator ]);
}

function handleEnvelopeChange( aEvent )
{
    var oscillator = instrument.oscillators[ activeOscillatorIndex ],
        target     = aEvent.target,
        value      = parseFloat( target.value );

    switch ( target )
    {
        case attackControl:
            oscillator.adsr.attack = value;
            break;

        case decayControl:
            oscillator.adsr.decay = value;
            break;

        case sustainControl:
            oscillator.adsr.sustain = value;
            break;

        case releaseControl:
            oscillator.adsr.release = value;
            break;
    }
}

function handleFilterChange( aEvent )
{
    var filter = instrument.filter;

    filter.frequency = parseFloat( frequencyControl.value );
    filter.q         = parseFloat( qControl.value );
    filter.speed     = parseFloat( speedControl.value );
    filter.depth     = depthControl.value;
    filter.lfoType   = Form.getSelectedOption( lfoSelect );
    filter.type      = Form.getSelectedOption( filterSelect );

    Pubsub.publishSync( Messages.UPDATE_FILTER_SETTINGS, [ instrumentId, filter ]);
}

function handleInstrumentSelect( aEvent )
{
    instrumentId = parseFloat( Form.getSelectedOption( instrumentSelect ));
    InstrumentController.update();
}

function handleOscillatorEnabledChange( aEvent )
{
    var oscillator = instrument.oscillators[ activeOscillatorIndex ];
    oscillator.enabled = ( Form.getSelectedOption( oscEnabledSelect ) === "true" );
    cacheOscillatorWaveForm( oscillator );
}

function handleWaveformChange( aEvent )
{
    var oscillator = instrument.oscillators[ activeOscillatorIndex ];
    instrument.oscillators[ activeOscillatorIndex ].waveform = Form.getSelectedOption( oscWaveformSelect );
    cacheOscillatorWaveForm( oscillator );
}

function handleVolumeChange( aEvent )
{
    instrument.oscillators[ activeOscillatorIndex ].volume = parseFloat( volumeControl.value );
    Pubsub.publishSync(
        Messages.ADJUST_OSCILLATOR_VOLUME,
        [ instrumentId, activeOscillatorIndex, instrument.oscillators[ activeOscillatorIndex ] ]
    );
}

function cacheOscillatorWaveForm( oscillator )
{
    if ( oscillator.enabled && oscillator.waveform === "CUSTOM" )
        Pubsub.publishSync( Messages.SET_CUSTOM_WAVEFORM, [ instrumentId, activeOscillatorIndex, oscillator.table ]);
    else
        Pubsub.publishSync( Messages.CHANGE_WAVEFORM, [ instrumentId, activeOscillatorIndex, oscillator ]);
}