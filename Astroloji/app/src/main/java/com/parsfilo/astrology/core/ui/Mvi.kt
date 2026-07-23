package com.parsfilo.astrology.core.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.launch

abstract class MviViewModel<STATE : Any, EVENT : Any, EFFECT : Any>(
    initialState: STATE,
) : ViewModel() {
    private val _state = MutableStateFlow(initialState)
    val state: StateFlow<STATE> = _state.asStateFlow()

    private val _effects = Channel<EFFECT>(Channel.BUFFERED)
    val effects = _effects.receiveAsFlow()

    protected fun setState(reducer: STATE.() -> STATE) {
        _state.value = _state.value.reducer()
    }

    protected fun sendEffect(builder: () -> EFFECT) {
        viewModelScope.launch { _effects.send(builder()) }
    }

    abstract fun onEvent(event: EVENT)
}
